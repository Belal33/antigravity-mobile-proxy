/**
 * Thinking Block Component
 * 
 * Creates the "thinking..." indicator shown while the agent processes.
 */

(function (App) {
    'use strict';

    App.createThinkingBlock = function (timeText) {
        const div = document.createElement('div');
        div.className = 'thinking-block';
        div.innerHTML = `
      <div class="thinking-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <span class="thinking-label">${App.escapeHtml(timeText || 'Thinking...')}</span>
    `;
        return div;
    };

})(window.App);
