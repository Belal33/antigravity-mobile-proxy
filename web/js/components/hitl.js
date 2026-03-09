/**
 * HITL (Human-in-the-Loop) Component
 * 
 * Creates the approval dialog and global approve/reject handlers.
 */

(function (App) {
    'use strict';

    const { escapeHtml, setStatus, API_BASE } = App;

    App.createHITLDialog = function (toolData) {
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
    };

    // ============ Global HITL Handlers ============

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

})(window.App);
