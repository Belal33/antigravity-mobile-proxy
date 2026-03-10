/**
 * Full agent state scraper.
 * Scrapes the Antigravity agent side panel DOM to extract comprehensive state.
 */

const { SELECTORS } = require('./selectors');
const fs = require('fs');
const path = require('path');

const DEBUG_FILE = path.join('/tmp', 'proxy-debug-state.json');

/**
 * Get simple chat history for the UI (all turns, user and agent).
 * Returns: { isRunning, turnCount, turns: [{ role, content }] }
 */
async function getChatHistory(ctx) {
    return await ctx.workbenchPage.evaluate(() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return { isRunning: false, turnCount: 0, turns: [] };

        const conversation = panel.querySelector('#conversation') || document.querySelector('#conversation');
        const scrollArea = conversation?.querySelector('.overflow-y-auto');
        const msgList = scrollArea?.querySelector('.mx-auto');

        if (!msgList || !msgList.children) {
            return { isRunning: false, turnCount: 0, turns: [] };
        }

        const turns = [];
        const allTurns = Array.from(msgList.children);

        for (const turnEl of allTurns) {
            // Determine role: agent turns have the distinctive relative flex col gap-y-3 struct
            const isAgent = !!turnEl.querySelector('.relative.flex.flex-col.gap-y-3');

            if (isAgent) {
                // For agent turns, extract the final response block(s)
                const textBlocks = Array.from(turnEl.querySelectorAll('.leading-relaxed.select-text'));
                const finalBlocks = textBlocks.filter(el => {
                    let ancestor = el.parentElement;
                    let depth = 0;
                    while (ancestor && ancestor !== turnEl && depth < 10) {
                        const cls = ancestor.getAttribute('class') || '';
                        if (cls.includes('max-h-0')) return false;
                        ancestor = ancestor.parentElement;
                        depth++;
                    }
                    return !!el.textContent?.trim();
                });

                if (finalBlocks.length > 0) {
                    const block = finalBlocks[finalBlocks.length - 1];
                    const clone = block.cloneNode(true);
                    clone.querySelectorAll('style, script').forEach(el => el.remove());
                    const html = clone.innerHTML?.trim();
                    if (html) turns.push({ role: 'agent', content: html });
                }
            } else {
                // User turn
                const userTextEl = turnEl.querySelector('.whitespace-pre-wrap');
                if (userTextEl) {
                    const text = userTextEl.textContent?.trim() || '';
                    if (text) turns.push({ role: 'user', content: text });
                }
            }
        }

        return {
            isRunning: false, // Could check if last turn is still running, but history is mainly for display
            turnCount: allTurns.length,
            turns
        };
    });
}

/**
 * Get a comprehensive snapshot of the entire agent panel state.
 * Includes turn-based scoping to isolate the current conversation turn.
 * Returns: { isRunning, turnCount, thinking[], toolCalls[], responses[],
 *           notifications[], error, fileChanges[], lastTurnResponseHTML }
 */
async function getFullAgentState(ctx) {
    const state = await ctx.workbenchPage.evaluate((spinnerSel) => {
        const getClass = (el) => (el?.getAttribute ? el.getAttribute('class') : '') || '';

        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return { isRunning: false, turnCount: 0, stepGroupCount: 0, thinking: [], toolCalls: [], responses: [], notifications: [], error: null, fileChanges: [], lastTurnResponseHTML: '' };

        // ── 1. Running state (multi-signal) ──
        let isRunning = false;

        // Signal A: Visible spinner
        const spinners = panel.querySelectorAll(spinnerSel);
        for (const spinner of spinners) {
            let el = spinner;
            let hidden = false;
            while (el) {
                const cls = getClass(el);
                if (cls.includes('invisible') || cls.includes('opacity-0')) {
                    hidden = true;
                    break;
                }
                el = el.parentElement;
            }
            if (!hidden) { isRunning = true; break; }
        }

        // Signal B: Stop/abort button visible (present only during agent runs)
        if (!isRunning) {
            const allBtns = panel.querySelectorAll('button');
            for (const btn of allBtns) {
                const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                const text = (btn.textContent?.trim() || '').toLowerCase();
                if ((text === 'stop' || text === 'abort' || label.includes('stop') || label.includes('abort') || label.includes('interrupt')) &&
                    getComputedStyle(btn).display !== 'none' && getComputedStyle(btn).visibility !== 'hidden') {
                    isRunning = true;
                    break;
                }
            }
        }

        // Signal C: Any tool call with no exit code and a cancel button (still executing)
        // (checked after tool calls are scraped below)

        // ── 2. Turn & Step Group structure ──
        const conversation = panel.querySelector('#conversation') || document.querySelector('#conversation');
        const scrollArea = conversation?.querySelector('.overflow-y-auto');
        const msgList = scrollArea?.querySelector('.mx-auto');
        const allTurns = msgList ? Array.from(msgList.children) : [];
        const turnCount = allTurns.length;
        const lastTurn = allTurns.length > 0 ? allTurns[allTurns.length - 1] : null;

        // Navigate into the content div inside the last turn
        const contentDiv = lastTurn?.querySelector('.relative.flex.flex-col.gap-y-3') || lastTurn;
        const stepGroups = contentDiv ? Array.from(contentDiv.children) : [];
        const stepGroupCount = stepGroups.length;

        // Scope scraping: use lastTurn so we capture all currently rendered tools in any step group
        const scopeEl = lastTurn || panel;

        // ── 3. Thinking blocks (scoped) ──
        const thinking = [];
        const thinkingBtns = Array.from(scopeEl.querySelectorAll('button')).filter(b =>
            b.textContent?.trim().startsWith('Thought for')
        );
        for (const btn of thinkingBtns) {
            thinking.push({ time: btn.textContent.trim() });
        }

        // ── 4. Tool call steps (scoped to active step group) ──
        const toolCalls = [];
        const toolContainers = scopeEl.querySelectorAll('.flex.flex-col.gap-2.border.rounded-lg.my-1');
        let toolCounter = window.__proxyToolCounter || 0;

        for (const container of toolContainers) {
            if (!container.dataset.proxyToolId) {
                container.dataset.proxyToolId = String(toolCounter++);
            }
            const proxyToolId = container.dataset.proxyToolId;

            const header = container.querySelector('.mb-1.px-2.py-1.text-sm');
            const statusSpan = header?.querySelector('span.opacity-60');
            const status = statusSpan?.textContent?.trim() || '';

            const pathSpan = container.querySelector('span.font-mono.text-sm');
            const filePath = pathSpan?.textContent?.trim() || '';

            // Extract command from PRE element (format: "CWD $ command args")
            let command = '';
            const pre = container.querySelector('pre.whitespace-pre-wrap');
            if (pre) {
                const preText = pre.textContent?.trim() || '';
                const dollarIdx = preText.indexOf('$');
                if (dollarIdx !== -1) {
                    command = preText.substring(dollarIdx + 1).trim();
                }
            }

            // Extract exit code from footer or spans
            let exitCode = null;
            const allEls = container.querySelectorAll('span, div');
            for (const el of allEls) {
                const t = el.textContent?.trim() || '';
                if (t.startsWith('Exit code')) {
                    exitCode = t;
                    break;
                }
            }

            // Detect Cancel button and collect footer buttons for HITL state
            const allBtns = Array.from(container.querySelectorAll('button'));
            const hasCancelBtn = allBtns.some(b => b.textContent?.trim() === 'Cancel');
            const footerButtons = allBtns
                .map(b => b.textContent?.trim())
                .filter(t => t && t !== 'Open' && !t.startsWith('Thought'));

            // Determine tool type from status text
            let type = 'unknown';
            const sl = status.toLowerCase();
            if (sl.includes('command')) type = 'command';
            else if (sl.includes('file') || sl.includes('edit') || sl.includes('creat') || sl.includes('writ')) type = 'file';
            else if (sl.includes('search') || sl.includes('grep')) type = 'search';
            else if (sl.includes('read') || sl.includes('view')) type = 'read';
            else if (sl.includes('brows')) type = 'browser';

            const terminal = container.querySelector('.component-shared-terminal');
            let terminalOutput = '';
            if (terminal) {
                const rows = terminal.querySelector('.xterm-rows')
                    || terminal.querySelector('.xterm-screen')
                    || terminal.querySelector('[class*="xterm"]');
                if (rows) terminalOutput = rows.textContent?.substring(0, 500) || '';
                if (!terminalOutput) terminalOutput = terminal.textContent?.substring(0, 500) || '';
            }

            toolCalls.push({
                id: proxyToolId,
                status, type, path: filePath,
                command: command || null, exitCode, hasCancelBtn,
                footerButtons,
                hasTerminal: !!terminal, terminalOutput: terminalOutput || null,
            });
        }
        window.__proxyToolCounter = toolCounter;

        // ── 4b. Inline file-system tools (Edited, Created, Analyzed, Read, etc.) ──
        const fileToolRows = scopeEl.querySelectorAll('.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)');
        const statusPattern = /^(Edited|Created|Analyzed|Read|Viewed|Wrote|Replaced|Searching|Deleted|Moved|Renamed|MCP Tool)/i;
        for (const row of fileToolRows) {
            try {
                const rowText = row.textContent?.trim() || '';
                const match = rowText.match(statusPattern);
                if (!match) continue;
                const statusText = match[1];

                if (!row.dataset.proxyToolId) {
                    row.dataset.proxyToolId = String(toolCounter++);
                }
                const proxyToolId = row.dataset.proxyToolId;

                const allSpans = Array.from(row.querySelectorAll('span'));
                let fileName = '';
                let additions = null;
                let deletions = null;
                let lineRange = null;
                let mcpArgs = null;
                let mcpOutput = null;
                let mcpToolName = null;

                if (statusText.startsWith('MCP')) {
                    // === MCP Tool extraction ===
                    const nameDiv = row.querySelector('.flex.flex-row.items-center.gap-1.overflow-hidden');
                    if (nameDiv) {
                        const directTexts = [];
                        for (const child of nameDiv.childNodes) {
                            if (child.nodeType === 3) directTexts.push(child.textContent.trim());
                        }
                        mcpToolName = directTexts.join('').trim() || null;
                    }
                    if (!mcpToolName) {
                        const colonIdx = rowText.indexOf(':');
                        if (colonIdx > -1) {
                            const afterColon = rowText.substring(colonIdx + 1).trim();
                            const cutoff = afterColon.search(/\n|Show|Ran/);
                            mcpToolName = cutoff > -1 ? afterColon.substring(0, cutoff).trim() : afterColon.substring(0, 60).trim();
                        }
                    }
                    fileName = mcpToolName || '';

                    // Arguments: extract from mtk-tokenized spans (Monaco JSON editor)
                    const argSpans = allSpans.filter(s => (s.className || '').startsWith('mtk'));
                    if (argSpans.length > 0) {
                        mcpArgs = argSpans.map(s => s.textContent).join('').trim();
                        if (mcpArgs.length > 500) mcpArgs = mcpArgs.substring(0, 500) + '…';
                    }

                    // Output: look for "Output" label and get sibling content
                    const outputLabel = allSpans.find(s => s.textContent?.trim() === 'Output');
                    if (outputLabel) {
                        const outputParent = outputLabel.closest('.flex.flex-col') || outputLabel.parentElement;
                        if (outputParent) {
                            const fullText = outputParent.textContent || '';
                            const outputIdx = fullText.indexOf('Output');
                            if (outputIdx > -1) {
                                mcpOutput = fullText.substring(outputIdx + 6).trim();
                                if (mcpOutput.length > 500) mcpOutput = mcpOutput.substring(0, 500) + '…';
                            }
                        }
                    }
                } else {
                    // === File tool extraction ===
                    const fileSpan = allSpans.find(s => {
                        const cls = s.className || '';
                        return cls.includes('inline-flex') && cls.includes('items-center');
                    });
                    fileName = fileSpan?.textContent?.trim() || '';

                    const addSpan = allSpans.find(s => (s.className || '').includes('text-green'));
                    additions = addSpan?.textContent?.trim() || null;

                    const delSpan = allSpans.find(s => (s.className || '').includes('text-red'));
                    deletions = delSpan?.textContent?.trim() || null;

                    const lineSpan = allSpans.find(s => /^#L\d/.test(s.textContent?.trim()));
                    lineRange = lineSpan?.textContent?.trim() || null;
                }

                // Determine type
                let type = 'file';
                const sl = statusText.toLowerCase();
                if (sl.includes('search') || sl.includes('grep')) type = 'search';
                else if (sl.includes('read') || sl.includes('view') || sl.includes('analyz')) type = 'read';
                else if (sl.startsWith('mcp')) type = 'mcp';

                // Capture footer/permission buttons
                const SKIP_BTNS = new Set(['open', 'show details', 'show', 'hide', 'copy', 'close']);

                let allRowBtns = Array.from(row.querySelectorAll('button'));

                let el = row.parentElement;
                let depth = 0;
                let foundPermBtns = [];
                while (el && depth < 5) {
                    const siblingBtns = Array.from(el.querySelectorAll('button'));
                    for (const btn of siblingBtns) {
                        const t = (btn.textContent || '').trim().toLowerCase();
                        if ((t.includes('allow') || t.includes('deny') || t === 'cancel') && !foundPermBtns.includes(btn)) {
                            foundPermBtns.push(btn);
                        }
                    }
                    if (foundPermBtns.length > 0 && foundPermBtns.length < 5) {
                        allRowBtns = [...allRowBtns, ...foundPermBtns];
                        break;
                    }
                    el = el.parentElement;
                    depth++;
                }

                // Remove duplicates and filter
                allRowBtns = [...new Set(allRowBtns)];
                const footerButtons = allRowBtns
                    .map(b => b.textContent?.trim())
                    .filter(t => t && !SKIP_BTNS.has(t.toLowerCase()) && !t.startsWith('Thought'));
                const hasCancelBtn = footerButtons.some(t => t.toLowerCase() === 'cancel');

                toolCalls.push({
                    id: proxyToolId,
                    status: statusText,
                    type,
                    path: fileName,
                    command: null,
                    exitCode: null,
                    hasCancelBtn,
                    footerButtons,
                    hasTerminal: false,
                    terminalOutput: null,
                    additions,
                    deletions,
                    lineRange,
                    mcpToolName,
                    mcpArgs,
                    mcpOutput,
                });
            } catch (err) {
                // Silent skip on error for resilience
            }
        }
        window.__proxyToolCounter = toolCounter;

        // ── 4c. Permission dialogs (panel-wide scan) ──
        try {
            const allPanelRows = panel.querySelectorAll('.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)');
            for (const permRow of allPanelRows) {
                const permBtns = Array.from(permRow.querySelectorAll('button'));
                const permBtnTexts = permBtns.map(b => b.textContent?.trim()).filter(Boolean);
                const hasPermButtons = permBtnTexts.some(t =>
                    /^(allow|deny|allow once|allow this conversation)$/i.test(t)
                );

                if (!hasPermButtons) continue;

                const alreadyCaptured = permRow.dataset?.proxyToolId &&
                    toolCalls.some(tc => tc.id === permRow.dataset.proxyToolId && tc.footerButtons.length > 0);
                if (alreadyCaptured) continue;

                const PERM_SKIP = new Set(['open', 'show details', 'show', 'hide', 'copy', 'close']);
                const actionButtons = permBtnTexts.filter(t =>
                    !PERM_SKIP.has(t.toLowerCase()) && !t.startsWith('Thought')
                );
                if (actionButtons.length === 0) continue;

                const lastAnalyzed = [...toolCalls].reverse().find(tc =>
                    /^(Analyzed|Read|Viewed)/i.test(tc.status)
                );

                if (lastAnalyzed && lastAnalyzed.footerButtons.length === 0) {
                    lastAnalyzed.footerButtons = actionButtons;
                    lastAnalyzed.hasCancelBtn = actionButtons.some(t => t.toLowerCase() === 'deny' || t.toLowerCase() === 'cancel');
                } else {
                    if (!permRow.dataset.proxyToolId) {
                        permRow.dataset.proxyToolId = String(window.__proxyToolCounter++);
                    }
                    const permText = permRow.textContent || '';
                    const pathMatch = permText.match(/access to\s+(.+?)(?:\?|$)/i);
                    const permPath = pathMatch ? pathMatch[1].trim() : '';

                    toolCalls.push({
                        id: permRow.dataset.proxyToolId,
                        status: 'Permission Required',
                        type: 'read',
                        path: permPath,
                        command: null,
                        exitCode: null,
                        hasCancelBtn: true,
                        footerButtons: actionButtons,
                        hasTerminal: false,
                        terminalOutput: null,
                        additions: null,
                        deletions: null,
                        lineRange: null,
                        mcpToolName: null,
                        mcpArgs: null,
                        mcpOutput: null,
                    });
                }
            }
        } catch (e) {
            // Silent skip for resilience
        }

        // Signal C from above: any tool still executing = agent still running
        if (!isRunning && toolCalls.some(t => t.hasCancelBtn && !t.exitCode)) {
            isRunning = true;
        }

        // Signal D: Active task boundary / subagent execution
        if (!isRunning) {
            const lastStepGroup = stepGroups[stepGroups.length - 1];
            if (lastStepGroup) {
                const spinners = lastStepGroup.querySelectorAll('.animate-spin');
                for (const spinner of spinners) {
                    if (spinner.classList.contains('w-4') && spinner.classList.contains('h-4')) continue;

                    let el = spinner;
                    let hidden = false;
                    while (el && el !== lastStepGroup) {
                        const cls = getClass(el);
                        if (cls.includes('invisible') || cls.includes('opacity-0') || cls.includes('hidden')) {
                            hidden = true; break;
                        }
                        el = el.parentElement;
                    }
                    if (!hidden) {
                        isRunning = true;
                        break;
                    }
                }

                if (!isRunning) {
                    const indicators = lastStepGroup.querySelectorAll('.animate-pulse, .in-progress-checkbox, .typing-indicator');
                    for (const ind of indicators) {
                        let el = ind;
                        let hidden = false;
                        while (el && el !== lastStepGroup) {
                            const cls = getClass(el);
                            if (cls.includes('invisible') || cls.includes('opacity-0') || cls.includes('hidden')) {
                                hidden = true; break;
                            }
                            el = el.parentElement;
                        }
                        if (!hidden) { isRunning = true; break; }
                    }
                }

                if (!isRunning) {
                    const statusTexts = lastStepGroup.querySelectorAll('[class*="text-sm"][class*="opacity"]');
                    for (const st of statusTexts) {
                        if (getClass(st).includes('invisible')) continue;
                        const txt = (st.textContent || '').toLowerCase();
                        if (txt.includes('running') || txt.includes('progress') || txt.includes('navigat') ||
                            txt.includes('executing') || txt.includes('analyzing') || txt.includes('processing') ||
                            txt.includes('subagent') || txt.includes('browser')) {
                            isRunning = true; break;
                        }
                    }
                }
            }
        }

        // ── 5. Notify user containers (scoped to last turn) ──
        const notifications = [];
        const notifyBlocks = scopeEl.querySelectorAll('.notify-user-container');
        for (const block of notifyBlocks) {
            const clone = block.cloneNode(true);
            clone.querySelectorAll('style, script').forEach(el => el.remove());
            const html = clone.innerHTML?.trim();
            if (html) notifications.push(html);
        }

        // ── 6. Final response blocks (scoped to last turn) ──
        const responses = [];
        let lastTurnResponseHTML = '';
        const textBlocks = Array.from(scopeEl.querySelectorAll('.leading-relaxed.select-text'));
        const finalBlocks = textBlocks.filter(el => {
            let ancestor = el.parentElement;
            let depth = 0;
            while (ancestor && ancestor !== scopeEl && depth < 10) {
                const cls = getClass(ancestor);
                if (cls.includes('max-h-0')) return false;
                ancestor = ancestor.parentElement;
                depth++;
            }
            const text = el.textContent?.trim() || '';
            if (!text) return false;
            return true;
        });
        for (const block of finalBlocks) {
            const clone = block.cloneNode(true);
            clone.querySelectorAll('style, script').forEach(el => el.remove());
            const html = clone.innerHTML?.trim();
            if (html) responses.push(html);
        }
        if (finalBlocks.length > 0) {
            lastTurnResponseHTML = finalBlocks[finalBlocks.length - 1].innerHTML || '';
        }

        // ── 7. Error detection ──
        let error = null;
        const panelText = panel.textContent || '';
        const errorPatterns = [
            'Agent terminated due to error',
            'error persists',
            'start a new conversation',
        ];
        for (const pattern of errorPatterns) {
            if (panelText.includes(pattern)) {
                const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, null, false);
                let n;
                while (n = walker.nextNode()) {
                    if (n.textContent.includes('Agent terminated')) {
                        error = n.textContent.trim();
                        break;
                    }
                }
                if (!error) error = '[Agent terminated due to error]';
                break;
            }
        }

        // ── 8. File change cards ──
        const fileChanges = [];
        const fileDiffIcons = panel.querySelectorAll('svg.lucide-file-diff');
        for (const icon of fileDiffIcons) {
            const parent = icon.closest('.flex.items-center');
            if (parent) {
                const nameSpan = parent.querySelector('span');
                if (nameSpan) {
                    fileChanges.push({
                        fileName: nameSpan.textContent?.trim() || '',
                        type: 'diff',
                    });
                }
            }
        }

        return {
            isRunning, turnCount, stepGroupCount, thinking, toolCalls, responses,
            notifications, error, fileChanges, lastTurnResponseHTML
        };
    }, SELECTORS.spinner);

    // Write debug state to file for inspection
    try {
        const debug = {
            timestamp: new Date().toISOString(),
            isRunning: state.isRunning,
            turnCount: state.turnCount,
            toolCallsCount: state.toolCalls.length,
            responsesCount: state.responses.length,
            rawLastTurnResponseHTML: state.lastTurnResponseHTML,
            extractedResponses: state.responses,
            toolCalls: state.toolCalls,
            thinking: state.thinking,
            notifications: state.notifications,
            error: state.error,
        };
        fs.writeFileSync(DEBUG_FILE, JSON.stringify(debug, null, 2));
    } catch (e) {
        // Silent — debug file writing should never break scraping
    }

    return state;
}

module.exports = { getFullAgentState, getChatHistory };
