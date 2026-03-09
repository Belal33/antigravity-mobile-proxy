/**
 * Helpers & Utility Functions
 * 
 * Pure utility functions used across the application:
 * HTML escaping, tool icons, markdown rendering, status management, etc.
 */

(function (App) {
    'use strict';

    const { dom } = App;

    // ============ HTML Escaping ============

    App.escapeHtml = function (text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    };

    // ============ Tool Helpers ============

    App.getToolIcon = function (type) {
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
    };

    App.getToolStatusClass = function (status) {
        const s = (status || '').toLowerCase();
        if (s.startsWith('running') || s.startsWith('editing') || s.startsWith('creating') || s.startsWith('search')) return 'running';
        if (s.startsWith('ran') || s.startsWith('edited') || s.startsWith('created') || s.startsWith('read') || s.startsWith('viewed') || s.startsWith('analyzed') || s.startsWith('wrote') || s.startsWith('replaced') || s.startsWith('deleted')) return 'done';
        if (s.includes('error') || s.includes('fail')) return 'error';
        if (s.startsWith('mcp')) return 'mcp';
        return 'running';
    };

    // ============ Rendering ============

    App.renderHTML = function (el, html) {
        el.innerHTML = html;
        if (typeof hljs !== 'undefined') {
            el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }
    };

    App.renderMarkdown = function (el, text) {
        if (typeof marked !== 'undefined') {
            el.innerHTML = marked.parse(text);
            if (typeof hljs !== 'undefined') {
                el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
            }
        } else {
            el.textContent = text;
        }
    };

    // ============ UI State ============

    App.scrollToBottom = function () {
        requestAnimationFrame(() => {
            dom.messagesEl.scrollTop = dom.messagesEl.scrollHeight;
        });
    };

    App.setStatus = function (statusState, text) {
        dom.statusIndicator.textContent = text;
        dom.statusIndicator.className = `header-subtitle status-${statusState}`;
    };

    App.updateSendButton = function () {
        dom.sendBtn.disabled = App.state.isStreaming || !dom.inputEl.value.trim();
    };

    // ============ Formatting ============

    App.formatRelativeTime = function (isoDate) {
        const diff = Date.now() - new Date(isoDate).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    App.formatFileSize = function (bytes) {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

})(window.App);
