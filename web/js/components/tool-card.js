/**
 * Tool Call Card Component
 * 
 * Creates and updates tool call cards for command, file, search,
 * MCP, and other tool types with live status updates.
 */

(function (App) {
    'use strict';

    const { escapeHtml, getToolIcon, getToolStatusClass, API_BASE } = App;

    /**
     * Attach action button event listeners (shared helper)
     */
    function attachActionListeners(container, data) {
        container.querySelectorAll('[data-action-btn]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const origText = btn.textContent;
                btn.disabled = true;
                btn.textContent = '...';
                try {
                    const resp = await fetch(`${API_BASE}/api/chat/action`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ toolId: data.id, buttonText: origText }),
                    });
                    const result = await resp.json();
                    if (!result.success) console.error('Action failed:', result.error);
                } catch (e) {
                    console.error('Action request failed:', e);
                } finally {
                    btn.disabled = false;
                    btn.textContent = origText;
                }
            });
        });
    }

    App.createToolCallCard = function (data) {
        const div = document.createElement('div');
        const statusClass = getToolStatusClass(data.status);
        div.className = `tool-call-card ${statusClass}`;
        div.setAttribute('data-tool-index', data.index);

        const icon = getToolIcon(data.type);
        const cancelHtml = data.hasCancelBtn ? '<span class="tool-pending-badge">Running</span>' : '';

        // HITL footer buttons
        const footerButtonsHtml = (data.footerButtons && data.footerButtons.length > 0)
            ? `<div class="tool-footer-actions">` +
            data.footerButtons.map(btnText => {
                const isApprove = /^(run|approve|allow|yes|accept|continue|save|confirm)/i.test(btnText);
                const cls = isApprove ? 'tool-action-btn approve' : 'tool-action-btn reject';
                return `<button class="${cls}" data-action-btn="${escapeHtml(btnText)}">${escapeHtml(btnText)}</button>`;
            }).join('') +
            `</div>`
            : '';

        // Command tools (terminal)
        const commandHtml = data.command
            ? `<div class="tool-command"><code><span class="tool-dollar">$</span> ${escapeHtml(data.command)}</code></div>`
            : '';
        const terminalHtml = data.terminalOutput
            ? `<div class="tool-terminal-output"><pre>${escapeHtml(data.terminalOutput)}</pre></div>`
            : '';
        const exitHtml = data.exitCode
            ? `<span class="tool-exit ${data.exitCode.includes('0') && !data.exitCode.includes('10') ? 'success' : 'error'}">${escapeHtml(data.exitCode)}</span>`
            : '';

        // File tools
        const pathHtml = data.path ? `<span class="tool-path">${escapeHtml(data.path)}</span>` : '';
        const additionsHtml = data.additions ? `<span class="tool-additions">${escapeHtml(data.additions)}</span>` : '';
        const deletionsHtml = data.deletions ? `<span class="tool-deletions">${escapeHtml(data.deletions)}</span>` : '';
        const lineRangeHtml = data.lineRange ? `<span class="tool-line-range">${escapeHtml(data.lineRange)}</span>` : '';

        // MCP tools
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
  ${footerButtonsHtml}
`;
        attachActionListeners(div, data);
        return div;
    };

    App.updateToolCallCard = function (el, data) {
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

        // Add or remove footer action buttons
        let existingFooter = el.querySelector('.tool-footer-actions');

        // Always recreate the footer to ensure buttons stay perfectly in sync
        if (existingFooter) {
            existingFooter.remove();
            existingFooter = null;
        }

        if (data.footerButtons && data.footerButtons.length > 0) {
            const footerDiv = document.createElement('div');
            footerDiv.className = 'tool-footer-actions';
            data.footerButtons.forEach(btnText => {
                const isApprove = /^(run|proceed|approve|allow|yes|accept|continue|save|confirm)([^a-z]|$)/i.test(btnText);
                const btn = document.createElement('button');
                btn.className = `tool-action-btn ${isApprove ? 'approve' : 'reject'}`;
                btn.setAttribute('data-action-btn', btnText);
                btn.textContent = btnText;
                btn.addEventListener('click', async () => {
                    const origText = btn.textContent;
                    btn.disabled = true;
                    btn.textContent = '...';
                    try {
                        const resp = await fetch(`${API_BASE}/api/chat/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ toolId: data.id, buttonText: origText }),
                        });
                        const result = await resp.json();
                        if (!result.success) console.error('Action failed:', result.error);
                    } catch (e) {
                        console.error('Action request failed:', e);
                    } finally {
                        btn.disabled = false;
                        btn.textContent = origText;
                    }
                });
                footerDiv.appendChild(btn);
            });
            el.appendChild(footerDiv);
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
    };

})(window.App);
