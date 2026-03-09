/**
 * App Configuration & Shared State
 * 
 * Initializes the App namespace, configures Marked.js/hljs,
 * caches DOM references, and defines shared application state.
 */

window.App = window.App || {};

(function (App) {
    'use strict';

    // ============ DOM References (cached once) ============

    App.dom = {
        messagesEl: document.getElementById('messages'),
        inputEl: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-btn'),
        statusIndicator: document.getElementById('status-indicator'),
        welcomeEl: document.getElementById('welcome-screen'),
        newChatBtn: document.getElementById('new-chat-btn'),
        windowSelectorBtn: document.getElementById('window-selector-btn'),
        windowSelectorLabel: document.getElementById('window-selector-label'),
        windowDropdown: document.getElementById('window-dropdown'),
        windowList: document.getElementById('window-list'),
        windowSelectorWrapper: document.getElementById('window-selector-wrapper'),
    };

    // ============ Configuration ============

    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            highlight(code, lang) {
                if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                    try { return hljs.highlight(code, { language: lang }).value; }
                    catch { /* fall through */ }
                }
                return code;
            },
        });
    }

    // ============ Shared State ============

    App.API_BASE = window.location.origin;

    App.state = {
        isStreaming: false,
        messages: [],
        currentController: null,
        activeConversationId: null,
    };

})(window.App);
