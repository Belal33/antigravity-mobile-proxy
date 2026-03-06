/**
 * Antigravity Chat Proxy — Client-Side Application
 * 
 * Connects to the VS Code extension HTTP server via SSE to
 * stream agent responses in real-time.
 */

(function () {
    'use strict';

    // ============ State ============

    const state = {
        messages: [],
        isStreaming: false,
        currentController: null, // AbortController for active request
    };

    // ============ DOM Elements ============

    const messagesEl = document.getElementById('messages');
    const welcomeEl = document.getElementById('welcome-screen');
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const statusIndicator = document.getElementById('status-indicator');
    const modelInfo = document.getElementById('model-info');

    // ============ Configuration ============

    // Marked.js configuration
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            highlight: function (code, lang) {
                if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch { /* fallthrough */ }
                }
                return code;
            },
        });
    }

    // ============ API ============

    const API_BASE = window.location.origin;

    async function checkHealth() {
        try {
            const res = await fetch(`${API_BASE}/api/health`);
            const data = await res.json();
            if (data.status === 'ok') {
                setStatus('connected', 'Agent');
                return true;
            }
        } catch {
            setStatus('disconnected', 'Disconnected');
        }
        return false;
    }

    async function fetchModels() {
        try {
            const res = await fetch(`${API_BASE}/api/models`);
            const data = await res.json();
            if (data.models && data.models.length > 0) {
                const m = data.models[0];
                modelInfo.textContent = `${m.family || m.name}`;
            }
        } catch {
            // Non-critical
        }
    }

    async function sendMessage(message) {
        if (state.isStreaming || !message.trim()) return;

        // Hide welcome screen
        if (welcomeEl) {
            welcomeEl.style.display = 'none';
        }

        // Add user message
        addMessage('user', message);

        // Clear input
        inputEl.value = '';
        inputEl.style.height = 'auto';
        updateSendButton();

        // Start streaming
        state.isStreaming = true;
        sendBtn.disabled = true;
        setStatus('streaming', 'Thinking...');

        // Create agent message placeholder
        const agentMsgEl = createMessageElement('agent', '');
        messagesEl.appendChild(agentMsgEl);
        const contentEl = agentMsgEl.querySelector('.message-content');

        // Show typing indicator
        const typingEl = createTypingIndicator();
        contentEl.appendChild(typingEl);
        scrollToBottom();

        let fullResponse = '';

        try {
            const controller = new AbortController();
            state.currentController = controller;

            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, mode: 'agent' }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE events from buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();

                    if (line.startsWith('event: ')) {
                        const eventType = line.substring(7);
                        // Next line should be data
                        if (i + 1 < lines.length && lines[i + 1].startsWith('data: ')) {
                            const dataStr = lines[i + 1].substring(6);
                            i++; // Skip the data line

                            try {
                                const data = JSON.parse(dataStr);

                                if (eventType === 'chunk' && data.text) {
                                    // Remove typing indicator on first chunk
                                    if (typingEl.parentNode) {
                                        typingEl.remove();
                                    }
                                    fullResponse += data.text;
                                    renderMarkdown(contentEl, fullResponse);
                                    scrollToBottom();
                                } else if (eventType === 'status') {
                                    updateStatusFromEvent(data.status);
                                } else if (eventType === 'error') {
                                    if (typingEl.parentNode) typingEl.remove();
                                    fullResponse += `\n\n⚠️ ${data.error}`;
                                    renderMarkdown(contentEl, fullResponse);
                                } else if (eventType === 'done') {
                                    // Complete
                                }
                            } catch {
                                // Ignore parse errors
                            }
                        }
                    }
                }
            }

            // Save agent message
            state.messages.push({ role: 'agent', content: fullResponse });
            saveHistory();

        } catch (err) {
            if (err.name === 'AbortError') {
                // User cancelled
                if (typingEl.parentNode) typingEl.remove();
                if (!fullResponse) {
                    contentEl.innerHTML = '<em style="color: var(--text-muted);">Cancelled</em>';
                }
            } else {
                console.error('Chat error:', err);
                if (typingEl.parentNode) typingEl.remove();
                renderMarkdown(contentEl, fullResponse + `\n\n⚠️ Connection error: ${err.message}`);
            }
        } finally {
            state.isStreaming = false;
            state.currentController = null;
            sendBtn.disabled = false;
            setStatus('connected', 'Agent');
            updateSendButton();
            scrollToBottom();
        }
    }

    // ============ UI Helpers ============

    function addMessage(role, content) {
        state.messages.push({ role, content });
        saveHistory();

        const msgEl = createMessageElement(role, content);
        messagesEl.appendChild(msgEl);
        scrollToBottom();
    }

    function createMessageElement(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;

        const header = document.createElement('div');
        header.className = 'message-header';

        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${role}`;
        avatar.textContent = role === 'user' ? '→' : '✦';

        const sender = document.createElement('span');
        sender.className = 'message-sender';
        sender.textContent = role === 'user' ? 'You' : 'Antigravity';

        header.appendChild(avatar);
        header.appendChild(sender);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (content) {
            renderMarkdown(contentDiv, content);
        }

        msgDiv.appendChild(header);
        msgDiv.appendChild(contentDiv);
        return msgDiv;
    }

    function createTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'typing-indicator';
        div.innerHTML = `
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <span class="typing-label">Agent is thinking...</span>
    `;
        return div;
    }

    function renderMarkdown(el, text) {
        if (typeof marked !== 'undefined') {
            el.innerHTML = marked.parse(text);
            // Apply syntax highlighting to code blocks
            if (typeof hljs !== 'undefined') {
                el.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }
        } else {
            el.textContent = text;
        }
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });
    }

    function setStatus(state, text) {
        statusIndicator.textContent = text;
        const dot = window.getComputedStyle(statusIndicator, '::before');
        // CSS handles the dot color via the class
        statusIndicator.className = `header-subtitle status-${state}`;
    }

    function updateStatusFromEvent(status) {
        const statusMap = {
            'sending_to_agent': 'Sending to agent...',
            'agent_processing': 'Agent processing...',
            'connecting_to_agent': 'Connecting...',
            'complete': 'Agent',
        };
        const text = statusMap[status] || status;
        setStatus('streaming', text);
    }

    function updateSendButton() {
        sendBtn.disabled = state.isStreaming || !inputEl.value.trim();
    }

    // ============ Chat History ============

    function saveHistory() {
        try {
            const trimmed = state.messages.slice(-100); // Keep last 100 messages
            localStorage.setItem('antigravity-chat-history', JSON.stringify(trimmed));
        } catch {
            // Ignore storage errors
        }
    }

    function loadHistory() {
        try {
            const saved = localStorage.getItem('antigravity-chat-history');
            if (saved) {
                state.messages = JSON.parse(saved);
                if (state.messages.length > 0) {
                    if (welcomeEl) welcomeEl.style.display = 'none';
                    state.messages.forEach(msg => {
                        const el = createMessageElement(msg.role, msg.content);
                        messagesEl.appendChild(el);
                    });
                    scrollToBottom();
                }
            }
        } catch {
            state.messages = [];
        }
    }

    function clearHistory() {
        state.messages = [];
        localStorage.removeItem('antigravity-chat-history');

        // Clear messages
        messagesEl.innerHTML = '';

        // Show welcome screen
        if (welcomeEl) {
            messagesEl.appendChild(welcomeEl);
            welcomeEl.style.display = '';
        }
    }

    // ============ Event Listeners ============

    // Auto-resize textarea
    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
        updateSendButton();
    });

    // Send on Enter (Shift+Enter for newline)
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!state.isStreaming && inputEl.value.trim()) {
                sendMessage(inputEl.value);
            }
        }
    });

    // Send button
    sendBtn.addEventListener('click', () => {
        if (!state.isStreaming && inputEl.value.trim()) {
            sendMessage(inputEl.value);
        }
    });

    // New chat button
    newChatBtn.addEventListener('click', () => {
        if (state.currentController) {
            state.currentController.abort();
        }
        clearHistory();
    });

    // Quick prompts
    document.querySelectorAll('.quick-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-prompt');
            if (prompt) {
                sendMessage(prompt);
            }
        });
    });

    // ============ Initialize ============

    async function init() {
        loadHistory();
        const healthy = await checkHealth();
        if (healthy) {
            fetchModels();
        }
        inputEl.focus();
    }

    init();
})();
