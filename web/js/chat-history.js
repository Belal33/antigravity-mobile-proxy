/**
 * Chat History Module
 * 
 * Persists chat messages to localStorage and restores on page load.
 */

(function (App) {
    'use strict';

    const { dom, state } = App;

    App.saveHistory = function () {
        try {
            const trimmed = state.messages.slice(-100);
            localStorage.setItem('antigravity-chat-history', JSON.stringify(trimmed));
        } catch { /* ignore quota errors */ }
    };

    App.loadHistory = function () {
        try {
            const saved = localStorage.getItem('antigravity-chat-history');
            if (saved) {
                state.messages = JSON.parse(saved);
                if (state.messages.length > 0) {
                    if (dom.welcomeEl) dom.welcomeEl.style.display = 'none';
                    state.messages.forEach(msg => {
                        const el = App.createMessageElement(msg.role, msg.content);
                        if (msg.role === 'agent') {
                            // Agent messages from localStorage might be raw HTML if they were saved that way
                            App.renderHTML(el.querySelector('.agent-response'), msg.content);
                        }
                        dom.messagesEl.appendChild(el);
                    });
                    App.scrollToBottom();
                }
            }
        } catch {
            state.messages = [];
        }
    };

    App.fetchAndRenderHistory = async function () {
        try {
            App.setStatus('fetching', 'Loading history...');
            const res = await fetch(`${App.API_BASE}/api/chat/history`);
            if (!res.ok) throw new Error('Failed to fetch history');

            const data = await res.json();

            // Clear current view
            dom.messagesEl.innerHTML = '';
            state.messages = [];

            if (data.turns && data.turns.length > 0) {
                if (dom.welcomeEl) dom.welcomeEl.style.display = 'none';

                for (const msg of data.turns) {
                    state.messages.push(msg); // Save to state for localStorage

                    if (msg.role === 'user') {
                        const el = App.createMessageElement('user', msg.content);
                        dom.messagesEl.appendChild(el);
                    } else if (msg.role === 'agent') {
                        const el = App.createAgentMessageElement();
                        // Turn off streaming border/animation for historical messages
                        el.classList.remove('streaming');

                        const responseContainer = el.querySelector('.agent-response');
                        App.renderHTML(responseContainer, msg.content);
                        dom.messagesEl.appendChild(el);
                    }
                }

                App.saveHistory(); // Update localStorage
                App.scrollToBottom();
            } else {
                // Empty history, show welcome screen
                if (dom.welcomeEl) {
                    dom.messagesEl.appendChild(dom.welcomeEl);
                    dom.welcomeEl.style.display = '';
                }
            }

            App.setStatus('connected', 'Agent');
            App.updateSendButton();

        } catch (e) {
            console.error('Error fetching chat history:', e);
            App.setStatus('error', 'History sync failed');
            // Fallback to local storage if backed fails
            App.loadHistory();
        }
    };

    App.clearHistory = function () {
        state.messages = [];
        localStorage.removeItem('antigravity-chat-history');
        dom.messagesEl.innerHTML = '';
        if (dom.welcomeEl) {
            dom.messagesEl.appendChild(dom.welcomeEl);
            dom.welcomeEl.style.display = '';
        }
    };

})(window.App);
