/**
 * Message Components
 * 
 * User/agent message creation, typing indicator,
 * file change indicator, and error banner.
 */

(function (App) {
    'use strict';

    const { dom, escapeHtml, renderMarkdown, scrollToBottom } = App;

    // ============ Message Management ============

    App.addMessage = function (role, content) {
        App.state.messages.push({ role, content });
        App.saveHistory();

        const msgEl = App.createMessageElement(role, content);
        dom.messagesEl.appendChild(msgEl);
        scrollToBottom();
    };

    App.createMessageElement = function (role, content) {
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
    };

    // ============ Typing Indicator ============

    App.createTypingIndicator = function () {
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
    };

    // ============ File Change Indicator ============

    App.createFileChangeIndicator = function (data) {
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
    };

    // ============ Error Banner ============

    App.createErrorBanner = function (message) {
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
    };

})(window.App);
