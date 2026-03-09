/**
 * API Layer
 * 
 * Health check and message sending with SSE streaming support.
 */

(function (App) {
    'use strict';

    const { dom, state, API_BASE } = App;

    App.checkHealth = async function () {
        try {
            const res = await fetch(`${API_BASE}/api/health`);
            const data = await res.json();
            if (data.connected) {
                App.setStatus('connected', 'Agent');
                if (data.model) {
                    document.getElementById('model-info').textContent = data.model;
                }
            } else {
                App.setStatus('disconnected', 'Disconnected');
            }
        } catch {
            App.setStatus('disconnected', 'Offline');
        }
    };

    App.sendMessage = async function (message) {
        if (state.isStreaming) return;

        const trimmed = message.trim();
        if (!trimmed) return;

        // Hide welcome screen
        if (dom.welcomeEl) dom.welcomeEl.style.display = 'none';

        // Show user message
        App.addMessage('user', trimmed);

        // Clear input
        dom.inputEl.value = '';
        dom.inputEl.style.height = 'auto';
        App.updateSendButton();

        // Create agent response container
        const agentMsgEl = App.createAgentMessageElement();
        dom.messagesEl.appendChild(agentMsgEl);

        const stepsContainer = agentMsgEl.querySelector('.agent-steps');
        const responseContainer = agentMsgEl.querySelector('.agent-response');
        const typingEl = App.createTypingIndicator();
        stepsContainer.appendChild(typingEl);
        App.scrollToBottom();

        // Track full response for history
        let fullResponse = '';
        const ctx = {
            agentMsgEl,
            stepsContainer,
            responseContainer,
            typingEl,
            setFullResponse(text) { fullResponse = text; },
            getFullResponse() { return fullResponse; },
        };

        state.isStreaming = true;
        App.setStatus('streaming', 'Agent typing...');
        App.updateSendButton();

        try {
            const controller = new AbortController();
            state.currentController = controller;

            const res = await fetch(`${API_BASE}/api/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: trimmed }),
                signal: controller.signal,
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const payload = JSON.parse(line.slice(6));
                        App.handleSSEvent(payload.type, payload, ctx);
                    } catch {
                        // skip unparseable lines
                    }
                }
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                const errorEl = App.createErrorBanner(e.message);
                stepsContainer.appendChild(errorEl);
                App.setStatus('error', 'Error');
            }
        } finally {
            state.isStreaming = false;
            state.currentController = null;
            if (typingEl.parentNode) typingEl.remove();
            agentMsgEl.classList.remove('streaming');
            App.updateSendButton();

            // Save agent response to history
            if (fullResponse) {
                state.messages.push({ role: 'agent', content: fullResponse });
                App.saveHistory();
            }
        }
    };

})(window.App);
