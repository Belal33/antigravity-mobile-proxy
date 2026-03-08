/**
 * Antigravity Chat Proxy — CDP-based automation (v2: Rich Streaming)
 * 
 * Connects to Antigravity's Electron debugging port via CDP,
 * exposes an HTTP API that forwards chat messages by typing
 * into the Antigravity chat input and reading agent responses
 * from the DOM.
 * 
 * v2 enhancements:
 *   - Full agent state scraping (thinking, tool calls, responses, HITL)
 *   - Typed SSE events with state diffing
 *   - HITL approve/reject endpoints
 * 
 * Prerequisites:
 *   Launch Antigravity with: antigravity . --remote-debugging-port=9223
 *   Install deps: npm install puppeteer-core
 * 
 * Usage:
 *   node proxy-server.js
 *   Open http://localhost:3457 in your browser
 */

const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_PORT = parseInt(process.env.CDP_PORT || '9223', 10);
const HTTP_PORT = 3457;

let workbenchPage = null;
let browser = null;
let allWorkbenches = [];
let activeWindowIdx = 0;

// ── Connect to Antigravity's Electron app ──────────────────────────────

async function discoverWorkbenches() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${CDP_PORT}`,
      defaultViewport: null
    });
  }
  const pages = await browser.pages();

  allWorkbenches = [];
  for (const p of pages) {
    const url = p.url();
    if (url.includes('workbench.html') && !url.includes('jetski')) {
      const title = await p.title();
      allWorkbenches.push({ page: p, title, url });
    }
  }
  return allWorkbenches;
}

async function connectToWorkbench() {
  await discoverWorkbenches();

  if (allWorkbenches.length === 0) {
    throw new Error('No workbench pages found. Is Antigravity running with --remote-debugging-port=9223?');
  }

  console.log(`[CDP] Found ${allWorkbenches.length} workbench window(s):`);
  for (let i = 0; i < allWorkbenches.length; i++) {
    console.log(`  [${i}] ${allWorkbenches[i].title}`);
  }

  const targetIdx = parseInt(process.env.PROXY_PAGE || '0', 10);
  activeWindowIdx = targetIdx;
  workbenchPage = allWorkbenches[targetIdx]?.page || allWorkbenches[0].page;
  console.log(`[CDP] ✅ Connected to: "${allWorkbenches[activeWindowIdx]?.title || 'unknown'}"`);
}

function selectWindow(idx) {
  if (idx < 0 || idx >= allWorkbenches.length) {
    throw new Error(`Invalid window index ${idx}. Available: 0-${allWorkbenches.length - 1}`);
  }
  activeWindowIdx = idx;
  workbenchPage = allWorkbenches[idx].page;
  console.log(`[CDP] Switched to window [${idx}]: "${allWorkbenches[idx].title}"`);
  return allWorkbenches[idx];
}

// ── DOM Selectors ──────────────────────────────────────────────────────

const SELECTORS = {
  chatInput: '#antigravity\\.agentSidePanelInputBox [contenteditable="true"][role="textbox"]',
  messageList: '#conversation > div:first-child .mx-auto.w-full',
  conversation: '#conversation',
  spinner: '.antigravity-agent-side-panel .animate-spin',
};

// ── Full Agent State Scraper ───────────────────────────────────────────

/**
 * Get a comprehensive snapshot of the entire agent panel state.
 * Includes turn-based scoping to isolate the current conversation turn.
 * Returns: { isRunning, turnCount, thinking[], toolCalls[], responses[],
 *           notifications[], error, fileChanges[], lastTurnResponseHTML }
 */
async function getFullAgentState() {
  return workbenchPage.evaluate((spinnerSel) => {
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
    // Conversation: #conversation > overflow-y-auto > .mx-auto (turn list)
    // Each turn child contains a contentDiv (.relative.flex.flex-col.gap-y-3.px-4)
    // Inside contentDiv: multiple step group children (some virtualized as bg-gray-500/10 skeletons)
    // The LAST step group child is the active one with real content
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
    // Primary selector: command/file tool containers 
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
        // Try multiple selectors for terminal content (xterm updates DOM structure)
        const rows = terminal.querySelector('.xterm-rows')
          || terminal.querySelector('.xterm-screen')
          || terminal.querySelector('[class*="xterm"]');
        if (rows) terminalOutput = rows.textContent?.substring(0, 500) || '';
        // Fallback: get terminal's own text content
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
    // These are NOT bordered containers — they live inside .flex.flex-col.space-y-2
    // Unlike bordered tools, these have NO specific wrapping element class.
    // Status text may be in a div, a text node, or span.opacity-70 (MCP tools).
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
          // Tool name: direct text of the flex-row div at depth 6
          const nameDiv = row.querySelector('.flex.flex-row.items-center.gap-1.overflow-hidden');
          if (nameDiv) {
            // Get direct text nodes only (exclude "MCP Tool:" and "Show Details" spans)
            const directTexts = [];
            for (const child of nameDiv.childNodes) {
              if (child.nodeType === 3) directTexts.push(child.textContent.trim());
            }
            mcpToolName = directTexts.join('').trim() || null;
          }
          if (!mcpToolName) {
            // Fallback: colon parsing
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
            // Get the parent of "Output" label and extract its text after "Output"
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
          // File name: from the inline-flex badge span
          const fileSpan = allSpans.find(s => {
            const cls = s.className || '';
            return cls.includes('inline-flex') && cls.includes('items-center');
          });
          fileName = fileSpan?.textContent?.trim() || '';

          // Additions: span.text-green-600 (e.g. "+1")
          const addSpan = allSpans.find(s => (s.className || '').includes('text-green'));
          additions = addSpan?.textContent?.trim() || null;

          // Deletions: span.text-red-600 (e.g. "-2")
          const delSpan = allSpans.find(s => (s.className || '').includes('text-red'));
          deletions = delSpan?.textContent?.trim() || null;

          // Line range: e.g. "#L1-40"
          const lineSpan = allSpans.find(s => /^#L\d/.test(s.textContent?.trim()));
          lineRange = lineSpan?.textContent?.trim() || null;
        }

        // Determine type
        let type = 'file';
        const sl = statusText.toLowerCase();
        if (sl.includes('search') || sl.includes('grep')) type = 'search';
        else if (sl.includes('read') || sl.includes('view') || sl.includes('analyz')) type = 'read';
        else if (sl.startsWith('mcp')) type = 'mcp';

        // Capture footer/permission buttons:
        // The permission dialog (e.g. "Allow directory access?") is often rendered
        // as a sibling to the container that holds the file rows, not the row itself.
        // We walk up 5 levels and look for buttons that have "Allow" or "Deny" in their text.
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
            // Got the permission buttons from the ancestor wrapper, merge them
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
          // File tool specific
          additions,
          deletions,
          lineRange,
          // MCP tool specific
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
    // Permission prompts like "Allow directory access to X?" with Deny/Allow buttons
    // can live outside the scopeEl used by fileToolRows. Scan the entire panel.
    try {
      const allPanelRows = panel.querySelectorAll('.flex.flex-col.space-y-2 > .flex.flex-row:not(.my-2)');
      for (const permRow of allPanelRows) {
        const permBtns = Array.from(permRow.querySelectorAll('button'));
        const permBtnTexts = permBtns.map(b => b.textContent?.trim()).filter(Boolean);
        const hasPermButtons = permBtnTexts.some(t =>
          /^(allow|deny|allow once|allow this conversation)$/i.test(t)
        );

        if (!hasPermButtons) continue;

        // Check if already captured by the fileToolRows loop
        const alreadyCaptured = permRow.dataset?.proxyToolId &&
          toolCalls.some(tc => tc.id === permRow.dataset.proxyToolId && tc.footerButtons.length > 0);
        if (alreadyCaptured) continue;

        const PERM_SKIP = new Set(['open', 'show details', 'show', 'hide', 'copy', 'close']);
        const actionButtons = permBtnTexts.filter(t =>
          !PERM_SKIP.has(t.toLowerCase()) && !t.startsWith('Thought')
        );
        if (actionButtons.length === 0) continue;

        // Try to attach to the last "Analyzed" / "Read" tool call
        const lastAnalyzed = [...toolCalls].reverse().find(tc =>
          /^(Analyzed|Read|Viewed)/i.test(tc.status)
        );

        if (lastAnalyzed && lastAnalyzed.footerButtons.length === 0) {
          lastAnalyzed.footerButtons = actionButtons;
          lastAnalyzed.hasCancelBtn = actionButtons.some(t => t.toLowerCase() === 'deny' || t.toLowerCase() === 'cancel');
        } else {
          // Create a new tool call for the permission dialog
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
    // When the agent uses browser_subagent or task_boundary, the UI shows
    // a step group with active status but no spinner/cancel at the panel level.
    if (!isRunning) {
      const lastStepGroup = stepGroups[stepGroups.length - 1];
      if (lastStepGroup) {
        // 1. Check for the specific inline spinners used inside step groups
        // e.g. <div class="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
        // but only if they are visible (opacity-0 and invisible mean they are hidden)
        const spinners = lastStepGroup.querySelectorAll('.animate-spin');
        for (const spinner of spinners) {
          // Skip the main panel spinner if it somehow ended up here
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

        // 2. Check for active indicators like animate-pulse on checkboxes
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

        // 3. Fallback: Check for status text indicating active work,
        // but ensure it's in a current active sub-block, not a finished one.
        if (!isRunning) {
          const statusTexts = lastStepGroup.querySelectorAll('[class*="text-sm"][class*="opacity"]');
          for (const st of statusTexts) {
            // Only consider opacity changing elements if they aren't hidden
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
    // Extract innerHTML to preserve formatting (rendered markdown)
    const responses = [];
    let lastTurnResponseHTML = '';
    const textBlocks = Array.from(scopeEl.querySelectorAll('.leading-relaxed.select-text'));
    const finalBlocks = textBlocks.filter(el => {
      const parentCls = getClass(el.parentElement);
      // Accept response blocks inside gap-y-3 (old structure) OR space-y-2 (file tool step groups)
      return el.parentElement && (parentCls.includes('gap-y-3') || parentCls.includes('space-y-2'));
    });
    for (const block of finalBlocks) {
      const clone = block.cloneNode(true);
      clone.querySelectorAll('style, script').forEach(el => el.remove());
      const html = clone.innerHTML?.trim();
      if (html) responses.push(html);
    }
    // Store last response's raw HTML for stabilization comparison
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

    // ── 7. File change cards ──
    // File diffs use .lucide-file-diff icons, regular files use .lucide-file
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
}

// ── Legacy helpers (kept for /api/chat blocking endpoint) ──────────────

async function getAgentResponseText() {
  return workbenchPage.evaluate(() => {
    const getClass = (el) => (el?.getAttribute ? el.getAttribute('class') : '') || '';
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return '';

    const notifyBlocks = panel.querySelectorAll('.notify-user-container');
    if (notifyBlocks.length > 0) {
      const lastBlock = notifyBlocks[notifyBlocks.length - 1];
      const clone = lastBlock.cloneNode(true);
      clone.querySelectorAll('style, script').forEach(el => el.remove());
      return clone.textContent?.trim() || '';
    }

    const textBlocks = Array.from(panel.querySelectorAll('.leading-relaxed.select-text'));
    const finalBlocks = textBlocks.filter(el =>
      el.parentElement && getClass(el.parentElement).includes('gap-y-3')
    );

    if (finalBlocks.length === 0) return '';
    const lastBlock = finalBlocks[finalBlocks.length - 1];
    const clone = lastBlock.cloneNode(true);
    clone.querySelectorAll('style, script').forEach(el => el.remove());
    return clone.textContent?.trim() || '';
  });
}

async function getResponseBlockCount() {
  return workbenchPage.evaluate(() => {
    const getClass = (el) => (el?.getAttribute ? el.getAttribute('class') : '') || '';
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return 0;
    const notifyCount = panel.querySelectorAll('.notify-user-container').length;
    const mdBlocks = Array.from(panel.querySelectorAll('.leading-relaxed.select-text'))
      .filter(el => el.parentElement && getClass(el.parentElement).includes('gap-y-3'));
    return notifyCount + mdBlocks.length;
  });
}

async function isAgentRunning() {
  return workbenchPage.evaluate((spinnerSel) => {
    const spinners = document.querySelectorAll(spinnerSel);
    for (const spinner of spinners) {
      let el = spinner;
      let hidden = false;
      while (el) {
        const cls = el.getAttribute ? el.getAttribute('class') : '';
        if (cls && (cls.includes('invisible') || cls.includes('opacity-0'))) {
          hidden = true;
          break;
        }
        el = el.parentElement;
      }
      if (!hidden) return true;
    }
    return false;
  }, SELECTORS.spinner);
}

async function checkForAgentError() {
  return workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return null;
    const text = panel.textContent || '';
    const errorPatterns = ['Agent terminated due to error', 'error persists', 'start a new conversation'];
    for (const pattern of errorPatterns) {
      if (text.includes(pattern)) {
        const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, null, false);
        let n;
        while (n = walk.nextNode()) {
          if (n.textContent.includes('Agent terminated')) return n.textContent.trim();
        }
        return '[Agent terminated due to error]';
      }
    }
    return null;
  });
}

// ── Message sending ───────────────────────────────────────────────────

async function sendMessage(text) {
  console.log(`[Chat] Sending: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);

  await workbenchPage.click(SELECTORS.chatInput);
  await sleep(200);

  await workbenchPage.evaluate((sel, msg) => {
    const el = document.querySelector(sel);
    if (el) {
      el.textContent = '';
      el.focus();
      document.execCommand('insertText', false, msg);
    }
  }, SELECTORS.chatInput, text);
  await sleep(300);

  await workbenchPage.keyboard.press('Enter');
  console.log(`[Chat] Sent.`);
}

// ── HITL interaction ──────────────────────────────────────────────────

async function clickApproveButton() {
  return workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { success: false, error: 'No panel found' };

    // Look for common approval button patterns
    const buttons = Array.from(panel.querySelectorAll('button'));

    // Priority 1: explicit "Run" or "Approve" buttons
    for (const btn of buttons) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if ((text === 'run' || text === 'approve' || text === 'allow' || text === 'yes') && !btn.disabled) {
        btn.click();
        return { success: true, clicked: btn.textContent?.trim() };
      }
    }

    // Priority 2: Look for the action button in the HITL footer area
    // The footer has .rounded-b.border-t and contains action buttons
    const footers = panel.querySelectorAll('.rounded-b.border-t');
    for (const footer of footers) {
      const actionBtns = footer.querySelectorAll('button');
      for (const btn of actionBtns) {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text !== 'cancel' && !btn.disabled) {
          btn.click();
          return { success: true, clicked: btn.textContent?.trim() };
        }
      }
    }

    return { success: false, error: 'No approve button found' };
  });
}

async function clickRejectButton() {
  return workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { success: false, error: 'No panel found' };

    const buttons = Array.from(panel.querySelectorAll('button'));
    for (const btn of buttons) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if ((text === 'cancel' || text === 'reject' || text === 'deny') && !btn.disabled) {
        btn.click();
        return { success: true, clicked: btn.textContent?.trim() };
      }
    }

    return { success: false, error: 'No reject/cancel button found' };
  });
}

// ── Blocking wait (legacy /api/chat) ──────────────────────────────────

async function waitForResponse(userMessage, timeoutMs = 180000) {
  const startTime = Date.now();
  const initialBlockCount = await getResponseBlockCount();
  console.log(`[Chat] Waiting for response... (initial blocks: ${initialBlockCount})`);

  // Phase 1: Wait for agent to start
  let started = false;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    if (await isAgentRunning()) {
      console.log(`[Chat] Agent processing (spinner detected)`);
      started = true;
      break;
    }
    const blocks = await getResponseBlockCount();
    if (blocks > initialBlockCount) {
      console.log(`[Chat] New response block(s) detected (${blocks} > ${initialBlockCount})`);
      started = true;
      await sleep(500);
      if (!await isAgentRunning()) {
        const response = await getAgentResponseText();
        console.log(`[Chat] ✅ Quick response (${response.length} chars)`);
        return response;
      }
      break;
    }
  }

  if (!started) {
    console.log(`[Chat] Warning: agent never started, returning current content`);
    return await getAgentResponseText() || '[Agent did not respond]';
  }

  // Phase 2: Wait for completion
  let doneCount = 0;
  while (Date.now() - startTime < timeoutMs) {
    const errorMsg = await checkForAgentError();
    if (errorMsg) {
      console.log(`[Chat] ❌ Agent error detected: ${errorMsg.substring(0, 80)}`);
      return errorMsg;
    }

    const running = await isAgentRunning();
    if (!running) {
      doneCount++;
      if (doneCount >= 3) {
        const response = await getAgentResponseText();
        if (response) {
          console.log(`[Chat] ✅ Response complete (${response.length} chars)`);
          return response;
        }
        const err = await checkForAgentError();
        if (err) {
          console.log(`[Chat] ❌ Agent error: ${err.substring(0, 80)}`);
          return err;
        }
        console.log(`[Chat] ⚠ Agent stopped but no response found`);
        return '[Agent did not produce a response]';
      }
    } else {
      doneCount = 0;
    }
    await sleep(500);
  }

  const errorMsg = await checkForAgentError();
  if (errorMsg) return errorMsg;
  const response = await getAgentResponseText();
  console.log(`[Chat] ⏱ Timeout. Got ${response.length} chars`);
  return response || '[Timeout: No response received]';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── State Diffing for SSE Stream ──────────────────────────────────────

/**
 * Compare two agent states and return typed events for any changes.
 */
function diffStates(prev, curr) {
  const events = [];

  // New thinking blocks
  if (curr.thinking.length > prev.thinking.length) {
    for (let i = prev.thinking.length; i < curr.thinking.length; i++) {
      events.push({ type: 'thinking', data: curr.thinking[i] });
    }
  }

  // New or updated tool calls
  if (curr.toolCalls.length > prev.toolCalls.length) {
    for (let i = prev.toolCalls.length; i < curr.toolCalls.length; i++) {
      console.log(`[diffStates] NEW tool_call at index ${i}: id=${curr.toolCalls[i]?.id}, status=${curr.toolCalls[i]?.status}`);
      events.push({ type: 'tool_call', data: { ...curr.toolCalls[i], index: i, isNew: true } });
    }
  }
  // Updated existing tool calls (status change, exit code appeared, cancel disappeared)
  const sharedLen = Math.min(prev.toolCalls.length, curr.toolCalls.length);
  for (let i = 0; i < sharedLen; i++) {
    const p = prev.toolCalls[i];
    const c = curr.toolCalls[i];
    const footerChanged = JSON.stringify(p.footerButtons) !== JSON.stringify(c.footerButtons);
    if (p.status !== c.status || p.exitCode !== c.exitCode || p.hasCancelBtn !== c.hasCancelBtn || footerChanged) {
      console.log(`[diffStates] UPDATED tool_call at index ${i}: status ${p.status}->${c.status}, exitCode ${p.exitCode}->${c.exitCode}, footerChanged=${footerChanged}`);
      events.push({ type: 'tool_call', data: { ...c, index: i, isNew: false } });
    }
  }

  // HITL: cancel button appeared on any tool call
  const prevHITL = prev.toolCalls.some(t => t.hasCancelBtn);
  const currHITL = curr.toolCalls.some(t => t.hasCancelBtn);
  if (currHITL && !prevHITL) {
    const hitlTool = curr.toolCalls.find(t => t.hasCancelBtn);
    events.push({ type: 'hitl', data: { action: 'approval_required', tool: hitlTool } });
  } else if (!currHITL && prevHITL) {
    events.push({ type: 'hitl', data: { action: 'resolved' } });
  }

  // New response blocks
  if (curr.responses.length > prev.responses.length) {
    for (let i = prev.responses.length; i < curr.responses.length; i++) {
      events.push({ type: 'response', data: { content: curr.responses[i], index: i, partial: curr.isRunning } });
    }
  }
  // Updated last response (text grew)
  if (curr.responses.length > 0 && prev.responses.length > 0 &&
    curr.responses.length === prev.responses.length) {
    const lastIdx = curr.responses.length - 1;
    if (curr.responses[lastIdx] !== prev.responses[lastIdx]) {
      events.push({ type: 'response', data: { content: curr.responses[lastIdx], index: lastIdx, partial: curr.isRunning } });
    }
  }

  // Notification blocks
  if (curr.notifications.length > prev.notifications.length) {
    for (let i = prev.notifications.length; i < curr.notifications.length; i++) {
      events.push({ type: 'notification', data: { content: curr.notifications[i], index: i } });
    }
  }

  // File changes
  if (curr.fileChanges && prev.fileChanges && curr.fileChanges.length > prev.fileChanges.length) {
    for (let i = prev.fileChanges.length; i < curr.fileChanges.length; i++) {
      events.push({ type: 'file_change', data: curr.fileChanges[i] });
    }
  }

  // Status change
  if (prev.isRunning !== curr.isRunning) {
    events.push({ type: 'status', data: { isRunning: curr.isRunning } });
  }

  // Error
  if (curr.error && !prev.error) {
    events.push({ type: 'error', data: { message: curr.error } });
  }

  return events;
}

// ── HTTP Server ────────────────────────────────────────────────────────

function startServer() {
  const webDir = path.join(__dirname, 'web');

  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);

    // ── Health check ──
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', connected: !!workbenchPage }));
      return;
    }

    // ── List windows ──
    if (url.pathname === '/api/windows' && req.method === 'GET') {
      try {
        await discoverWorkbenches();
        const windows = allWorkbenches.map((w, i) => ({
          index: i, title: w.title, active: i === activeWindowIdx
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ windows }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── Select window ──
    if (url.pathname === '/api/windows/select' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { index } = JSON.parse(body);
          if (index === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'index is required' }));
            return;
          }
          await discoverWorkbenches();
          const selected = selectWindow(index);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ selected: { index, title: selected.title } }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // ── Get current agent state ──
    if (url.pathname === '/api/chat/state' && req.method === 'GET') {
      try {
        if (!workbenchPage) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not connected to Antigravity' }));
          return;
        }
        const state = await getFullAgentState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── Debug: DOM diagnostic ──
    if (url.pathname === '/api/debug/dom' && req.method === 'GET') {
      try {
        if (!workbenchPage) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not connected' }));
          return;
        }
        const debug = await workbenchPage.evaluate(() => {
          const panel = document.querySelector('.antigravity-agent-side-panel');
          if (!panel) return { error: 'No panel' };
          const conv = panel.querySelector('#conversation');
          const scrollArea = conv?.querySelector('.overflow-y-auto');
          const msgList = scrollArea?.querySelector('.mx-auto');
          const turns = msgList ? msgList.children.length : 0;
          const lastTurn = msgList?.lastElementChild;
          const contentDiv = lastTurn?.querySelector('.relative.flex.flex-col.gap-y-3') || lastTurn;
          const toolEls = panel.querySelectorAll('.flex.flex-col.gap-2.border.rounded-lg.my-1');
          const responseEls = panel.querySelectorAll('.leading-relaxed.select-text');
          return {
            panelTextLen: panel.textContent?.length || 0,
            hasConversation: !!conv,
            hasScrollArea: !!scrollArea,
            hasMsgList: !!msgList,
            turnCount: turns,
            hasContentDiv: !!contentDiv,
            stepGroupCount: contentDiv?.children?.length || 0,
            toolContainerCount: toolEls.length,
            toolContainers: Array.from(toolEls).map(el => ({
              cls: (el.className || '').substring(0, 200),
              text: (el.textContent || '').substring(0, 80),
            })),
            responseBlockCount: responseEls.length,
          };
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(debug, null, 2));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── HITL: Approve ──
    if (url.pathname === '/api/chat/approve' && req.method === 'POST') {
      try {
        if (!workbenchPage) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not connected' }));
          return;
        }
        const result = await clickApproveButton();
        res.writeHead(result.success ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── HITL: Reject ──
    if (url.pathname === '/api/chat/reject' && req.method === 'POST') {
      try {
        if (!workbenchPage) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not connected' }));
          return;
        }
        const result = await clickRejectButton();
        res.writeHead(result.success ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── HITL: Generic Tool Action (click any footer button by toolId + buttonText) ──
    if (url.pathname === '/api/chat/action' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          if (!workbenchPage) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not connected' }));
            return;
          }
          const { toolId, buttonText } = JSON.parse(body);
          if (!buttonText) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'buttonText is required' }));
            return;
          }

          const result = await workbenchPage.evaluate((toolId, buttonText) => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            if (!panel) return { success: false, error: 'No panel found' };

            // Scope to the specific tool container if toolId provided
            let searchRoot = panel;
            if (toolId) {
              const scoped = panel.querySelector(`[data-proxy-tool-id="${toolId}"]`);
              if (scoped) searchRoot = scoped;
            }

            const buttons = Array.from(searchRoot.querySelectorAll('button'));
            const target = buttons.find(b => {
              const t = b.textContent?.trim() || '';
              return t.toLowerCase() === buttonText.toLowerCase() && !b.disabled;
            });

            if (target) {
              target.click();
              return { success: true, clicked: target.textContent?.trim() };
            }
            return { success: false, error: `Button "${buttonText}" not found` };
          }, toolId, buttonText);

          res.writeHead(result.success ? 200 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // ── Send chat (blocking) ──
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { message } = JSON.parse(body);
          if (!message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'message is required' }));
            return;
          }
          if (!workbenchPage) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not connected to Antigravity' }));
            return;
          }

          await sendMessage(message);
          const response = await waitForResponse(message);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response }));
        } catch (e) {
          console.error('[Server] Error:', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // ── SSE streaming chat (rich typed events) ──
    if (url.pathname === '/api/chat/stream' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { message } = JSON.parse(body);
          if (!message || !workbenchPage) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'message required and connection needed' }));
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          // Send initial status
          const writeEvent = (type, data) => {
            res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
          };

          writeEvent('status', { isRunning: true, phase: 'sending' });

          // Capture initial state before sending
          let prevState = await getFullAgentState();
          let sessionToolCalls = new Map();
          let sessionResponses = [];  // Accumulated responses across virtualizations

          await sendMessage(message);

          writeEvent('status', { isRunning: true, phase: 'waiting' });

          const startTime = Date.now();
          let doneCount = 0;
          let started = false;
          let lastStableHTML = '';   // Track response HTML for stabilization
          const initialTurnCount = prevState.turnCount;

          const interval = setInterval(async () => {
            try {
              const currState = await getFullAgentState();

              // Track tools by ID to prevent virtualization from shrinking the array
              if (currState.turnCount > prevState.turnCount) {
                sessionToolCalls.clear();
                // CRITICAL: Reset prev state's tool calls so diffStates sees new tools as NEW,
                // not as updates to old tools from the previous turn
                prevState.toolCalls = [];
                prevState.responses = [];
                prevState.thinking = [];
                prevState.notifications = [];
                prevState.fileChanges = [];
              }
              for (const t of currState.toolCalls) {
                sessionToolCalls.set(t.id, t);
              }
              // Restore full accumulated tool list
              currState.toolCalls = Array.from(sessionToolCalls.values());

              // Accumulate responses: survive DOM virtualization
              if (currState.responses.length > sessionResponses.length) {
                // New response(s) appeared — capture all
                sessionResponses = [...currState.responses];
              } else if (currState.responses.length < sessionResponses.length && currState.responses.length > 0) {
                // DOM virtualized away earlier responses — keep accumulated, update last
                const lastIdx = currState.responses.length - 1;
                sessionResponses[sessionResponses.length - 1] = currState.responses[lastIdx];
              } else if (currState.responses.length === sessionResponses.length && currState.responses.length > 0) {
                // Same count — update last (streaming)
                sessionResponses[sessionResponses.length - 1] = currState.responses[currState.responses.length - 1];
              }
              currState.responses = [...sessionResponses];

              // Detect start via multiple signals
              if (!started) {
                if (currState.isRunning ||
                  currState.turnCount > initialTurnCount ||
                  currState.toolCalls.length > prevState.toolCalls.length ||
                  currState.responses.length > prevState.responses.length ||
                  currState.thinking.length > prevState.thinking.length) {
                  started = true;
                  writeEvent('status', { isRunning: true, phase: 'processing' });
                }
              }

              // Check for unresolved tools in the SESSION (meaning the tool was started but never finished,
              // even if the DOM virtualized it or briefly unmounted the UI row)
              const hasUnresolvedTools = Array.from(sessionToolCalls.values()).some(t => {
                // A tool might be considered unresolved if it doesn't have an exit code
                // and its type is something that takes time (like command or browser)
                return t.hasCancelBtn && !t.exitCode;
              });

              // Compute and emit diffs
              const events = diffStates(prevState, currState);
              if (currState.toolCalls.length > 0 || prevState.toolCalls.length > 0) {
                console.log(`[SSE Debug] toolCalls: prev=${prevState.toolCalls.length}, curr=${currState.toolCalls.length}, events=${events.filter(e => e.type === 'tool_call').length}`);
              }
              for (const evt of events) {
                if (evt.type === 'tool_call') {
                  console.log(`[SSE Debug] Emitting tool_call event:`, JSON.stringify({ index: evt.data.index, isNew: evt.data.isNew, status: evt.data.status, id: evt.data.id }));
                }
                writeEvent(evt.type, evt.data);
              }

              // Check for completion — requires MULTIPLE conditions:
              // 1. Agent has started
              // 2. Agent is no longer running (no spinner, no stop btn, no pending tool calls)
              // 3. No error
              // 4. Must be stable for 10 consecutive checks (5 seconds)
              // 5. Response HTML must be identical for 3 consecutive done checks (content stabilized)
              // 6. No new content has appeared (tool calls, responses, thinking)
              // 7. No unresolved tools in session cache
              if (started && !currState.isRunning && !currState.error && !hasUnresolvedTools) {
                // Check if any new content appeared — if so, agent might be between steps
                const contentChanged = (
                  currState.toolCalls.length !== prevState.toolCalls.length ||
                  currState.responses.length !== prevState.responses.length ||
                  currState.thinking.length !== prevState.thinking.length ||
                  currState.notifications.length !== prevState.notifications.length ||
                  currState.fileChanges.length !== prevState.fileChanges.length ||
                  currState.stepGroupCount !== prevState.stepGroupCount ||
                  // Check if last response content changed (streaming within same block)
                  (currState.responses.length > 0 && prevState.responses.length > 0 &&
                    currState.responses[currState.responses.length - 1] !== prevState.responses[prevState.responses.length - 1]) ||
                  // Check raw HTML change (catches any DOM update)
                  currState.lastTurnResponseHTML !== prevState.lastTurnResponseHTML
                );

                if (contentChanged) {
                  // New content still appearing — not done yet
                  doneCount = 0;
                  lastStableHTML = '';
                } else {
                  doneCount++;
                }

                // Content stabilization: response HTML must stop changing
                const currentHTML = currState.lastTurnResponseHTML || '';
                if (doneCount >= 2 && currentHTML && currentHTML !== lastStableHTML) {
                  doneCount = 1; // Reset, content still changing
                }
                lastStableHTML = currentHTML;

                // Require longer stabilization for subagent-heavy sessions
                const hasSubagentTools = currState.toolCalls.some(t =>
                  t.type === 'browser' || (t.status || '').toLowerCase().includes('subagent') ||
                  (t.status || '').toLowerCase().includes('navigat')
                );
                const requiredDoneCount = hasSubagentTools ? 20 : 10; // 10s vs 5s
                if (doneCount >= requiredDoneCount) {
                  // Confirmed done — read from current turn's responses (HTML)
                  const finalResponse = currState.notifications.length > 0
                    ? currState.notifications[currState.notifications.length - 1]
                    : currState.responses.length > 0
                      ? currState.responses[currState.responses.length - 1]
                      : '';

                  writeEvent('done', {
                    finalResponse,
                    isHTML: true,
                    thinking: currState.thinking,
                    toolCalls: currState.toolCalls,
                  });
                  clearInterval(interval);
                  res.end();
                  return;
                }
              } else {
                doneCount = 0;
                lastStableHTML = '';
              }

              // Error
              if (currState.error) {
                writeEvent('error', { message: currState.error });
                writeEvent('done', { error: currState.error });
                clearInterval(interval);
                res.end();
                return;
              }

              // Timeout (10 min for complex tasks with tool calls)
              if (Date.now() - startTime > 600000) {
                const finalResponse = currState.responses.length > 0
                  ? currState.responses[currState.responses.length - 1]
                  : '[Timeout]';
                writeEvent('done', { finalResponse, timeout: true });
                clearInterval(interval);
                res.end();
                return;
              }

              prevState = currState;
            } catch (e) {
              writeEvent('error', { message: e.message });
              clearInterval(interval);
              res.end();
            }
          }, 500);

          req.on('close', () => clearInterval(interval));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // ── Serve static web files ──
    if (url.pathname.startsWith('/')) {
      let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
      const fullPath = path.join(webDir, safePath);

      if (!fullPath.startsWith(webDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(fullPath);
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          // Fallback to index.html for SPA routing
          fs.readFile(path.join(webDir, 'index.html'), (err2, indexData) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not found');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(indexData);
            }
          });
        } else {
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
          res.end(data);
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.setTimeout(0);

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n[Server] ✅ Chat proxy running at http://0.0.0.0:${HTTP_PORT}`);
    console.log(`[Server] API:`);
    console.log(`  POST /api/chat           → Send message, get full response (blocking)`);
    console.log(`  POST /api/chat/stream    → Send message, SSE stream (typed events)`);
    console.log(`  GET  /api/chat/state     → Get current agent panel state`);
    console.log(`  POST /api/chat/approve   → Click approve/run button (HITL)`);
    console.log(`  POST /api/chat/reject    → Click cancel/reject button (HITL)`);
    console.log(`  POST /api/chat/action    → Click any footer button by toolId + buttonText (HITL)`);
    console.log(`  GET  /api/windows        → List workbench windows`);
    console.log(`  POST /api/windows/select → Switch target window`);
    console.log(`  GET  /api/health         → Health check`);
    console.log(`  GET  /                   → Web chat UI\n`);
  });
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  try {
    await connectToWorkbench();
    startServer();
  } catch (e) {
    console.error('[Fatal]', e.message);
    process.exit(1);
  }
}

main();
