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
                        dom.messagesEl.appendChild(el);
                    });
                    App.scrollToBottom();
                }
            }
        } catch {
            state.messages = [];
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
