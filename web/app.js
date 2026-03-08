/**
 * Antigravity Chat Proxy — Rich Streaming Client (v2)
 * 
 * Handles typed SSE events from the proxy server:
 * thinking, tool_call, response, hitl, status, error, done, notification, file_change
 */

(function () {
    'use strict';

    // ============ State ============

    const state = {
        messages: [],
        isStreaming: false,
        currentController: null,
    };

    // ============ DOM Elements ============

    const messagesEl = document.getElementById('messages');
    const welcomeEl = document.getElementById('welcome-screen');
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const statusIndicator = document.getElementById('status-indicator');
    const modelInfo = document.getElementById('model-info');
    const windowSelectorBtn = document.getElementById('window-selector-btn');
    const windowSelectorLabel = document.getElementById('window-selector-label');
    const windowDropdown = document.getElementById('window-dropdown');
    const windowList = document.getElementById('window-list');
    const windowSelectorWrapper = document.getElementById('window-selector-wrapper');

    // ============ Configuration ============

    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            highlight: function (code, lang) {
                if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                    try { return hljs.highlight(code, { language: lang }).value; } catch { }
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

    async function sendMessage(message) {
        if (state.isStreaming || !message.trim()) return;

        if (welcomeEl) welcomeEl.style.display = 'none';

        // Add user message
        addMessage('user', message);

        inputEl.value = '';
        inputEl.style.height = 'auto';
        updateSendButton();

        state.isStreaming = true;
        sendBtn.disabled = true;
        setStatus('streaming', 'Thinking...');

        // Create agent message container with sections
        const agentMsgEl = createAgentMessageElement();
        messagesEl.appendChild(agentMsgEl);
        scrollToBottom();

        const stepsContainer = agentMsgEl.querySelector('.agent-steps');
        const responseContainer = agentMsgEl.querySelector('.agent-response');
        const typingEl = createTypingIndicator();
        responseContainer.appendChild(typingEl);

        let fullResponse = '';
        let toolCallElements = new Map(); // index -> DOM element

        try {
            const controller = new AbortController();
            state.currentController = controller;

            const response = await fetch(`${API_BASE}/api/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
                signal: controller.signal,
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let currentEvent = null;  // persists across chunk boundaries

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();

                    if (trimmed.startsWith('event: ')) {
                        currentEvent = trimmed.substring(7);
                        continue;
                    }

                    if (trimmed.startsWith('data: ') && currentEvent) {
                        try {
                            const data = JSON.parse(trimmed.substring(6));
                            console.log(`[SSE] Event: ${currentEvent}`, currentEvent === 'tool_call' ? data : '');
                            handleSSEvent(currentEvent, data, {
                                stepsContainer,
                                responseContainer,
                                typingEl,
                                toolCallElements,
                                agentMsgEl,
                                setFullResponse: (text) => { fullResponse = text; },
                                getFullResponse: () => fullResponse,
                            });
                        } catch (parseErr) {
                            console.error(`[SSE] Failed to parse ${currentEvent} event:`, parseErr.message, '| Raw:', trimmed.substring(0, 200));
                        }
                        currentEvent = null;
                    }
                }
            }

            state.messages.push({ role: 'agent', content: fullResponse });
            saveHistory();

        } catch (err) {
            if (err.name === 'AbortError') {
                if (typingEl.parentNode) typingEl.remove();
                if (!fullResponse) {
                    responseContainer.innerHTML = '<em class="text-muted">Cancelled</em>';
                }
            } else {
                console.error('Chat error:', err);
                if (typingEl.parentNode) typingEl.remove();
                renderMarkdown(responseContainer, fullResponse + `\n\n⚠️ Connection error: ${err.message}`);
            }
        } finally {
            state.isStreaming = false;
            state.currentController = null;
            sendBtn.disabled = false;
            setStatus('connected', 'Agent');
            updateSendButton();
            scrollToBottom();

            // Remove streaming glow
            agentMsgEl.classList.remove('streaming');
        }
    }

    // ============ SSE Event Handler ============

    function handleSSEvent(eventType, data, ctx) {
        switch (eventType) {

            case 'status':
                if (data.phase === 'sending') setStatus('streaming', 'Sending...');
                else if (data.phase === 'waiting') setStatus('streaming', 'Waiting...');
                else if (data.phase === 'processing') setStatus('streaming', 'Processing...');
                else if (data.isRunning) setStatus('streaming', 'Agent working...');
                else setStatus('connected', 'Agent');
                break;

            case 'thinking':
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                const thinkingEl = createThinkingBlock(data.time);
                ctx.stepsContainer.appendChild(thinkingEl);
                scrollToBottom();
                setStatus('streaming', 'Thinking...');
                break;

            case 'tool_call':
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                if (data.isNew) {
                    const toolEl = createToolCallCard(data);
                    ctx.toolCallElements.set(data.index, toolEl);
                    ctx.stepsContainer.appendChild(toolEl);
                    setStatus('streaming', `${data.status}...`);
                } else {
                    // Update existing tool call card
                    const existingEl = ctx.toolCallElements.get(data.index);
                    if (existingEl) {
                        updateToolCallCard(existingEl, data);
                    }
                }
                scrollToBottom();
                break;

            case 'hitl':
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                if (data.action === 'approval_required') {
                    const hitlEl = createHITLDialog(data.tool);
                    ctx.stepsContainer.appendChild(hitlEl);
                    setStatus('hitl', 'Approval needed');
                } else if (data.action === 'resolved') {
                    // Remove HITL dialogs
                    ctx.stepsContainer.querySelectorAll('.hitl-dialog').forEach(el => {
                        el.classList.add('resolved');
                        setTimeout(() => el.remove(), 600);
                    });
                }
                scrollToBottom();
                break;

            case 'response':
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                ctx.setFullResponse(data.content);
                renderHTML(ctx.responseContainer, data.content);
                if (data.partial) {
                    ctx.agentMsgEl.classList.add('streaming');
                } else {
                    ctx.agentMsgEl.classList.remove('streaming');
                }
                scrollToBottom();
                setStatus('streaming', 'Receiving response...');
                break;

            case 'notification':
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                ctx.setFullResponse(data.content);
                renderHTML(ctx.responseContainer, data.content);
                scrollToBottom();
                break;

            case 'file_change':
                const fileEl = createFileChangeIndicator(data);
                ctx.stepsContainer.appendChild(fileEl);
                scrollToBottom();
                break;

            case 'error':
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                const errorEl = createErrorBanner(data.message);
                ctx.stepsContainer.appendChild(errorEl);
                setStatus('error', 'Error');
                scrollToBottom();
                break;

            case 'done':
                if (ctx.typingEl.parentNode) ctx.typingEl.remove();
                ctx.agentMsgEl.classList.remove('streaming');
                // If we have a final response that wasn't already rendered
                if (data.finalResponse && !ctx.getFullResponse()) {
                    ctx.setFullResponse(data.finalResponse);
                    if (data.isHTML) {
                        renderHTML(ctx.responseContainer, data.finalResponse);
                    } else {
                        renderMarkdown(ctx.responseContainer, data.finalResponse);
                    }
                }
                setStatus('connected', 'Agent');
                scrollToBottom();
                break;
        }
    }

    // ============ UI Component Creators ============

    function createAgentMessageElement() {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message agent streaming';

        const header = document.createElement('div');
        header.className = 'message-header';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar agent';
        avatar.textContent = '✦';

        const sender = document.createElement('span');
        sender.className = 'message-sender';
        sender.textContent = 'Antigravity';

        header.appendChild(avatar);
        header.appendChild(sender);

        // Steps container (thinking, tool calls, HITL)
        const stepsDiv = document.createElement('div');
        stepsDiv.className = 'agent-steps';

        // Response container (final markdown)
        const responseDiv = document.createElement('div');
        responseDiv.className = 'agent-response message-content';

        msgDiv.appendChild(header);
        msgDiv.appendChild(stepsDiv);
        msgDiv.appendChild(responseDiv);
        return msgDiv;
    }

    function createThinkingBlock(timeText) {
        const div = document.createElement('div');
        div.className = 'thinking-block';
        div.innerHTML = `
      <div class="thinking-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <span class="thinking-label">${escapeHtml(timeText || 'Thinking...')}</span>
    `;
        return div;
    }

    function createToolCallCard(data) {
        const div = document.createElement('div');
        const statusClass = getToolStatusClass(data.status);
        div.className = `tool-call-card ${statusClass}`;
        div.setAttribute('data-tool-index', data.index);

        const icon = getToolIcon(data.type);
        const cancelHtml = data.hasCancelBtn ? '<span class="tool-pending-badge">Running</span>' : '';

        // === Command tools (terminal) ===
        const commandHtml = data.command
            ? `<div class="tool-command"><code><span class="tool-dollar">$</span> ${escapeHtml(data.command)}</code></div>`
            : '';
        const terminalHtml = data.terminalOutput
            ? `<div class="tool-terminal-output"><pre>${escapeHtml(data.terminalOutput)}</pre></div>`
            : '';
        const exitHtml = data.exitCode
            ? `<span class="tool-exit ${data.exitCode.includes('0') && !data.exitCode.includes('10') ? 'success' : 'error'}">${escapeHtml(data.exitCode)}</span>`
            : '';

        // === File tools (Edited, Created, etc.) ===
        const pathHtml = data.path ? `<span class="tool-path">${escapeHtml(data.path)}</span>` : '';
        const additionsHtml = data.additions ? `<span class="tool-additions">${escapeHtml(data.additions)}</span>` : '';
        const deletionsHtml = data.deletions ? `<span class="tool-deletions">${escapeHtml(data.deletions)}</span>` : '';
        const lineRangeHtml = data.lineRange ? `<span class="tool-line-range">${escapeHtml(data.lineRange)}</span>` : '';

        // === MCP tools ===
        let mcpDetailsHtml = '';
        if (data.type === 'mcp') {
            if (data.mcpArgs) {
                mcpDetailsHtml += `<div class="tool-mcp-section"><span class="tool-mcp-label">Arguments</span><div class="tool-mcp-code"><pre>${escapeHtml(data.mcpArgs)}</pre></div></div>`;
            }
            if (data.mcpOutput) {
                mcpDetailsHtml += `<div class="tool-mcp-section"><span class="tool-mcp-label">Output</span><div class="tool-mcp-output"><pre>${escapeHtml(data.mcpOutput)}</pre></div></div>`;
            }
        }

        div.innerHTML = `
  <div class="tool-card-header">
    <div class="tool-card-left">
      ${icon}
      <span class="tool-status-text">${escapeHtml(data.status)}</span>
      ${cancelHtml}
    </div>
    <div class="tool-card-right">
      ${pathHtml}
      ${additionsHtml}
      ${deletionsHtml}
      ${lineRangeHtml}
      ${exitHtml}
    </div>
  </div>
  ${commandHtml}
  ${terminalHtml}
  ${mcpDetailsHtml}
`;
        return div;
    }

    function updateToolCallCard(el, data) {
        const statusClass = getToolStatusClass(data.status);
        el.className = `tool-call-card ${statusClass}`;

        const statusText = el.querySelector('.tool-status-text');
        if (statusText) statusText.textContent = data.status;

        // Update or add command if it appeared
        if (data.command && !el.querySelector('.tool-command')) {
            const cmdDiv = document.createElement('div');
            cmdDiv.className = 'tool-command';
            cmdDiv.innerHTML = `<code><span class="tool-dollar">$</span> ${escapeHtml(data.command)}</code>`;
            el.appendChild(cmdDiv);
        }

        // Update exit code
        const rightDiv = el.querySelector('.tool-card-right');
        if (rightDiv && data.exitCode && !el.querySelector('.tool-exit')) {
            const exitSpan = document.createElement('span');
            exitSpan.className = `tool-exit ${data.exitCode.includes('0') && !data.exitCode.includes('10') ? 'success' : 'error'}`;
            exitSpan.textContent = data.exitCode;
            rightDiv.appendChild(exitSpan);
        }

        // Update additions/deletions
        if (rightDiv) {
            if (data.additions && !el.querySelector('.tool-additions')) {
                const addSpan = document.createElement('span');
                addSpan.className = 'tool-additions';
                addSpan.textContent = data.additions;
                rightDiv.appendChild(addSpan);
            }
            if (data.deletions && !el.querySelector('.tool-deletions')) {
                const delSpan = document.createElement('span');
                delSpan.className = 'tool-deletions';
                delSpan.textContent = data.deletions;
                rightDiv.appendChild(delSpan);
            }
        }

        // Remove pending badge if cancel is gone
        if (!data.hasCancelBtn) {
            const badge = el.querySelector('.tool-pending-badge');
            if (badge) badge.remove();
        }

        // Add terminal output if it appeared
        if (data.terminalOutput && !el.querySelector('.tool-terminal-output')) {
            const termDiv = document.createElement('div');
            termDiv.className = 'tool-terminal-output';
            termDiv.innerHTML = `<pre>${escapeHtml(data.terminalOutput)}</pre>`;
            el.appendChild(termDiv);
        }

        // Add MCP details if they appeared
        if (data.type === 'mcp' && !el.querySelector('.tool-mcp-section')) {
            if (data.mcpArgs) {
                const argsDiv = document.createElement('div');
                argsDiv.className = 'tool-mcp-section';
                argsDiv.innerHTML = `<span class="tool-mcp-label">Arguments</span><div class="tool-mcp-code"><pre>${escapeHtml(data.mcpArgs)}</pre></div>`;
                el.appendChild(argsDiv);
            }
            if (data.mcpOutput) {
                const outputDiv = document.createElement('div');
                outputDiv.className = 'tool-mcp-section';
                outputDiv.innerHTML = `<span class="tool-mcp-label">Output</span><div class="tool-mcp-output"><pre>${escapeHtml(data.mcpOutput)}</pre></div>`;
                el.appendChild(outputDiv);
            }
        }
    }

    function createHITLDialog(toolData) {
        const div = document.createElement('div');
        div.className = 'hitl-dialog';

        const toolInfo = toolData ? `
      <div class="hitl-tool-info">
        <span class="hitl-tool-status">${escapeHtml(toolData.status || 'Tool call')}</span>
        ${toolData.command ? `<code class="hitl-command">${escapeHtml(toolData.command)}</code>` : ''}
        ${toolData.path ? `<span class="hitl-path">${escapeHtml(toolData.path)}</span>` : ''}
      </div>
    ` : '';

        div.innerHTML = `
      <div class="hitl-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        </svg>
        <span>Agent needs approval</span>
      </div>
      ${toolInfo}
      <div class="hitl-actions">
        <button class="hitl-approve-btn" onclick="window.__hitlApprove()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Approve
        </button>
        <button class="hitl-reject-btn" onclick="window.__hitlReject()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Reject
        </button>
      </div>
    `;
        return div;
    }

    function createFileChangeIndicator(data) {
        const div = document.createElement('div');
        div.className = 'file-change-indicator';
        div.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>${escapeHtml(data.fileName || 'File changed')}</span>
    `;
        return div;
    }

    function createErrorBanner(message) {
        const div = document.createElement('div');
        div.className = 'error-banner';
        div.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
        return div;
    }

    // ============ HITL Global Handlers ============

    window.__hitlApprove = async () => {
        try {
            setStatus('streaming', 'Approving...');
            await fetch(`${API_BASE}/api/chat/approve`, { method: 'POST' });
        } catch (e) {
            console.error('Approve failed:', e);
        }
    };

    window.__hitlReject = async () => {
        try {
            setStatus('streaming', 'Rejecting...');
            await fetch(`${API_BASE}/api/chat/reject`, { method: 'POST' });
        } catch (e) {
            console.error('Reject failed:', e);
        }
    };

    // ============ Window Selector ============

    let windowDropdownOpen = false;

    async function loadWindows() {
        try {
            const res = await fetch(`${API_BASE}/api/windows`);
            const data = await res.json();
            renderWindowList(data.windows || []);
        } catch (e) {
            console.error('Failed to load windows:', e);
        }
    }

    function renderWindowList(windows) {
        windowList.innerHTML = '';
        if (windows.length === 0) {
            windowList.innerHTML = '<div class="window-item-empty">No windows found</div>';
            return;
        }

        // Update the button label with the active window
        const active = windows.find(w => w.active);
        if (active) {
            // Extract just the project name from the title (first segment before " - ")
            const projectName = active.title.split(' - ')[0] || active.title;
            windowSelectorLabel.textContent = projectName;
        }

        for (const win of windows) {
            const item = document.createElement('button');
            item.className = `window-item ${win.active ? 'active' : ''}`;
            const projectName = win.title.split(' - ')[0] || win.title;
            item.innerHTML = `
          <span class="window-item-dot ${win.active ? 'active' : ''}"></span>
          <span class="window-item-name">${escapeHtml(projectName)}</span>
          <span class="window-item-index">#${win.index}</span>
        `;
            item.addEventListener('click', () => selectWindow(win.index));
            windowList.appendChild(item);
        }
    }

    async function selectWindow(index) {
        try {
            windowSelectorLabel.textContent = 'Switching...';
            closeWindowDropdown();
            const res = await fetch(`${API_BASE}/api/windows/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index }),
            });
            const data = await res.json();
            if (data.selected) {
                const projectName = data.selected.title.split(' - ')[0] || data.selected.title;
                windowSelectorLabel.textContent = projectName;
                // Clear chat history since we switched context
                clearHistory();
            }
            await loadWindows(); // refresh list
        } catch (e) {
            console.error('Failed to select window:', e);
            windowSelectorLabel.textContent = 'Error';
        }
    }

    function toggleWindowDropdown() {
        windowDropdownOpen = !windowDropdownOpen;
        windowDropdown.classList.toggle('open', windowDropdownOpen);
        windowSelectorWrapper.classList.toggle('open', windowDropdownOpen);
        if (windowDropdownOpen) loadWindows(); // refresh on open
    }

    function closeWindowDropdown() {
        windowDropdownOpen = false;
        windowDropdown.classList.remove('open');
        windowSelectorWrapper.classList.remove('open');
    }

    windowSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWindowDropdown();
    });

    document.addEventListener('click', (e) => {
        if (!windowSelectorWrapper.contains(e.target)) closeWindowDropdown();
    });

    // ============ Helpers ============

    function getToolIcon(type) {
        const icons = {
            command: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
            file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
            search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
            read: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
            browser: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
            mcp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/><circle cx="12" cy="12" r="4"/></svg>',
            unknown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>',
        };
        return `<span class="tool-icon">${icons[type] || icons.unknown}</span>`;
    }

    function getToolStatusClass(status) {
        const s = (status || '').toLowerCase();
        if (s.startsWith('running') || s.startsWith('editing') || s.startsWith('creating') || s.startsWith('search')) return 'running';
        if (s.startsWith('ran') || s.startsWith('edited') || s.startsWith('created') || s.startsWith('read') || s.startsWith('viewed') || s.startsWith('analyzed') || s.startsWith('wrote') || s.startsWith('replaced') || s.startsWith('deleted')) return 'done';
        if (s.includes('error') || s.includes('fail')) return 'error';
        if (s.startsWith('mcp')) return 'mcp';
        return 'running';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // ============ Shared UI Helpers ============

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
        if (content) renderMarkdown(contentDiv, content);

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

    /**
     * Render pre-rendered HTML content from Antigravity (already markdown->HTML).
     * Only applies syntax highlighting to code blocks.
     */
    function renderHTML(el, html) {
        el.innerHTML = html;
        if (typeof hljs !== 'undefined') {
            el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }
    }

    function renderMarkdown(el, text) {
        if (typeof marked !== 'undefined') {
            el.innerHTML = marked.parse(text);
            if (typeof hljs !== 'undefined') {
                el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
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

    function setStatus(statusState, text) {
        statusIndicator.textContent = text;
        statusIndicator.className = `header-subtitle status-${statusState}`;
    }

    function updateSendButton() {
        sendBtn.disabled = state.isStreaming || !inputEl.value.trim();
    }

    // ============ Chat History ============

    function saveHistory() {
        try {
            const trimmed = state.messages.slice(-100);
            localStorage.setItem('antigravity-chat-history', JSON.stringify(trimmed));
        } catch { }
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
        messagesEl.innerHTML = '';
        if (welcomeEl) {
            messagesEl.appendChild(welcomeEl);
            welcomeEl.style.display = '';
        }
    }

    // ============ Event Listeners ============

    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
        updateSendButton();
    });

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!state.isStreaming && inputEl.value.trim()) sendMessage(inputEl.value);
        }
    });

    sendBtn.addEventListener('click', () => {
        if (!state.isStreaming && inputEl.value.trim()) sendMessage(inputEl.value);
    });

    newChatBtn.addEventListener('click', () => {
        if (state.currentController) state.currentController.abort();
        clearHistory();
    });

    document.querySelectorAll('.quick-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-prompt');
            if (prompt) sendMessage(prompt);
        });
    });

    // ============ Initialize ============

    async function init() {
        loadHistory();
        await checkHealth();
        await loadWindows();
        inputEl.focus();
    }

    init();
})();
