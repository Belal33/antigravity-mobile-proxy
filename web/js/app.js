/**
 * App Entry Point
 * 
 * Wires up all event listeners and initializes the application.
 * This must be the LAST script loaded.
 */

(function (App) {
    'use strict';

    const { dom, state } = App;

    // ============ Input Event Listeners ============

    dom.inputEl.addEventListener('input', () => {
        dom.inputEl.style.height = 'auto';
        dom.inputEl.style.height = Math.min(dom.inputEl.scrollHeight, 150) + 'px';
        App.updateSendButton();
    });

    dom.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!state.isStreaming && dom.inputEl.value.trim()) App.sendMessage(dom.inputEl.value);
        }
    });

    dom.sendBtn.addEventListener('click', () => {
        if (!state.isStreaming && dom.inputEl.value.trim()) App.sendMessage(dom.inputEl.value);
    });

    dom.newChatBtn.addEventListener('click', () => {
        if (state.currentController) state.currentController.abort();
        App.clearHistory();
    });

    document.querySelectorAll('.quick-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-prompt');
            if (prompt) App.sendMessage(prompt);
        });
    });

    // ============ Initialize ============

    async function init() {
        App.loadHistory();
        await App.checkHealth();
        await App.loadWindows();
        dom.inputEl.focus();
    }

    init();

})(window.App);
