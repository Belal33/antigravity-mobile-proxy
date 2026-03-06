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
 * Returns: { isRunning, thinking[], toolCalls[], responses[], notifications[], error }
 */
async function getFullAgentState() {
  return workbenchPage.evaluate((spinnerSel) => {
    const getClass = (el) => (el?.getAttribute ? el.getAttribute('class') : '') || '';

    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { isRunning: false, thinking: [], toolCalls: [], responses: [], notifications: [], error: null };

    // ── 1. Spinner / Running state ──
    let isRunning = false;
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

    // ── 2. Thinking blocks ──
    // Thinking toggles are buttons starting with "Thought for" inside .isolate
    const thinking = [];
    const thinkingBtns = Array.from(panel.querySelectorAll('button')).filter(b =>
      b.textContent?.trim().startsWith('Thought for')
    );
    for (const btn of thinkingBtns) {
      thinking.push({ time: btn.textContent.trim() });
    }

    // ── 3. Tool call steps ──
    // Each tool step is wrapped in .flex.flex-col.gap-2 with border/rounded
    const toolCalls = [];
    const toolContainers = panel.querySelectorAll('.flex.flex-col.gap-2.border.rounded-lg.my-1');
    for (const container of toolContainers) {
      // Find header: .mb-1.px-2.py-1.text-sm.border-b
      const header = container.querySelector('.mb-1.px-2.py-1.text-sm');
      const statusSpan = header?.querySelector('span.opacity-60');
      const status = statusSpan?.textContent?.trim() || '';

      // Find file path / cwd
      const pathSpan = container.querySelector('span.font-mono.text-sm');
      const filePath = pathSpan?.textContent?.trim() || '';

      // Find command text (after the $ sign)
      let command = '';
      const allSpans = container.querySelectorAll('span');
      let foundDollar = false;
      for (const s of allSpans) {
        if (foundDollar) {
          const t = s.textContent?.trim();
          if (t && !t.startsWith('Ask every time') && !t.startsWith('Exit code')) {
            command = t;
            break;
          }
        }
        if (s.textContent?.trim() === '$') foundDollar = true;
      }

      // Find exit code
      let exitCode = null;
      for (const s of allSpans) {
        const t = s.textContent?.trim() || '';
        if (t.startsWith('Exit code')) {
          exitCode = t;
          break;
        }
      }

      // Check for Cancel button (indicates pending HITL)
      const hasCancelBtn = !!container.querySelector('button') &&
        Array.from(container.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Cancel');

      // Determine tool type from status text
      let type = 'unknown';
      const sl = status.toLowerCase();
      if (sl.includes('command')) type = 'command';
      else if (sl.includes('file') || sl.includes('edit') || sl.includes('creat') || sl.includes('writ')) type = 'file';
      else if (sl.includes('search') || sl.includes('grep')) type = 'search';
      else if (sl.includes('read') || sl.includes('view')) type = 'read';
      else if (sl.includes('brows')) type = 'browser';

      // Check for embedded terminal output
      const terminal = container.querySelector('.component-shared-terminal');
      let terminalOutput = '';
      if (terminal) {
        const rows = terminal.querySelector('.xterm-rows');
        if (rows) terminalOutput = rows.textContent?.substring(0, 500) || '';
      }

      toolCalls.push({
        status,
        type,
        path: filePath,
        command: command || null,
        exitCode,
        hasCancelBtn,
        hasTerminal: !!terminal,
        terminalOutput: terminalOutput || null,
      });
    }

    // ── 4. Notify user containers ──
    const notifications = [];
    const notifyBlocks = panel.querySelectorAll('.notify-user-container');
    for (const block of notifyBlocks) {
      const clone = block.cloneNode(true);
      clone.querySelectorAll('style, script').forEach(el => el.remove());
      const text = clone.textContent?.trim();
      if (text) notifications.push(text);
    }

    // ── 5. Final response blocks ──
    const responses = [];
    const textBlocks = Array.from(panel.querySelectorAll('.leading-relaxed.select-text'));
    const finalBlocks = textBlocks.filter(el =>
      el.parentElement && getClass(el.parentElement).includes('gap-y-3')
    );
    for (const block of finalBlocks) {
      const clone = block.cloneNode(true);
      clone.querySelectorAll('style, script').forEach(el => el.remove());
      const text = clone.textContent?.trim();
      if (text) responses.push(text);
    }

    // ── 6. Error detection ──
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
      isRunning,
      thinking,
      toolCalls,
      responses,
      notifications,
      error,
      fileChanges,
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
      events.push({ type: 'tool_call', data: { ...curr.toolCalls[i], index: i, isNew: true } });
    }
  }
  // Updated existing tool calls (status change, exit code appeared, cancel disappeared)
  const sharedLen = Math.min(prev.toolCalls.length, curr.toolCalls.length);
  for (let i = 0; i < sharedLen; i++) {
    const p = prev.toolCalls[i];
    const c = curr.toolCalls[i];
    if (p.status !== c.status || p.exitCode !== c.exitCode || p.hasCancelBtn !== c.hasCancelBtn) {
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
          await sendMessage(message);

          writeEvent('status', { isRunning: true, phase: 'waiting' });

          const startTime = Date.now();
          let doneCount = 0;
          let started = false;

          const interval = setInterval(async () => {
            try {
              const currState = await getFullAgentState();

              // Detect start
              if (!started) {
                if (currState.isRunning ||
                  currState.toolCalls.length > prevState.toolCalls.length ||
                  currState.responses.length > prevState.responses.length ||
                  currState.thinking.length > prevState.thinking.length) {
                  started = true;
                  writeEvent('status', { isRunning: true, phase: 'processing' });
                }
              }

              // Compute and emit diffs
              const events = diffStates(prevState, currState);
              for (const evt of events) {
                writeEvent(evt.type, evt.data);
              }

              // Check for completion
              if (started && !currState.isRunning && !currState.error) {
                doneCount++;
                if (doneCount >= 3) {
                  // Emit final response
                  const finalResponse = currState.notifications.length > 0
                    ? currState.notifications[currState.notifications.length - 1]
                    : currState.responses.length > 0
                      ? currState.responses[currState.responses.length - 1]
                      : '';

                  writeEvent('done', {
                    finalResponse,
                    thinking: currState.thinking,
                    toolCalls: currState.toolCalls,
                  });
                  clearInterval(interval);
                  res.end();
                  return;
                }
              } else {
                doneCount = 0;
              }

              // Error
              if (currState.error) {
                writeEvent('error', { message: currState.error });
                writeEvent('done', { error: currState.error });
                clearInterval(interval);
                res.end();
                return;
              }

              // Timeout
              if (Date.now() - startTime > 300000) { // 5 min timeout for stream
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
