/**
 * Antigravity Chat Proxy — CDP-based automation
 * 
 * Connects to Antigravity's Electron debugging port via CDP,
 * exposes an HTTP API that forwards chat messages by typing
 * into the Antigravity chat input and reading agent responses
 * from the DOM.
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
let allWorkbenches = [];  // stores {page, title, url} for each window
let activeWindowIdx = 0;

// ── Connect to Antigravity's Electron app ──────────────────────────────

async function discoverWorkbenches() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${CDP_PORT}`,
      defaultViewport: null  // Don't resize the IDE window
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
// Based on reverse-engineering the Antigravity IDE DOM structure:
//
// #conversation
//   ├── div.flex.w-full.grow (messages area)
//   │   └── div.h-full.overflow-y-auto (scroll container)
//   │       └── div.mx-auto.w-full (message list — THIS is what we read)
//   └── div.relative.flex.flex-col (input area)
//       └── #antigravity.agentSidePanelInputBox
//           └── div[contenteditable="true"][role="textbox"] (chat input)

const SELECTORS = {
  chatInput: '#antigravity\\.agentSidePanelInputBox [contenteditable="true"][role="textbox"]',
  messageList: '#conversation > div:first-child .mx-auto.w-full',
  conversation: '#conversation',
  // Spinner: appears while agent is running
  spinner: '.antigravity-agent-side-panel .animate-spin',
};

// ── Chat interaction helpers ───────────────────────────────────────────

/** Check if the agent crashed or terminated with an error */
async function checkForAgentError() {
  return workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return null;

    const text = panel.textContent || '';
    const errorPatterns = [
      'Agent terminated due to error',
      'error persists',
      'start a new conversation',
    ];
    for (const pattern of errorPatterns) {
      if (text.includes(pattern)) {
        // Try to extract the specific error message block
        const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, null, false);
        let n;
        while (n = walk.nextNode()) {
          if (n.textContent.includes('Agent terminated')) {
            return n.textContent.trim();
          }
        }
        return '[Agent terminated due to error]';
      }
    }
    return null;
  });
}

/** Get the agent's final user-facing response */
async function getAgentResponseText() {
  return workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return '';

    // 1. Check for explicit notify blocks first (e.g. system alerts, walkthroughs)
    const notifyBlocks = panel.querySelectorAll('.notify-user-container');
    if (notifyBlocks.length > 0) {
      const lastBlock = notifyBlocks[notifyBlocks.length - 1];
      const clone = lastBlock.cloneNode(true);
      clone.querySelectorAll('style, script').forEach(el => el.remove());
      return clone.textContent?.trim() || '';
    }

    // 2. Otherwise get the standard markdown replies
    // The DOM puts "thoughts" in an unclassed <div>, but actual responses
    // are inside a wrapper with "flex-col gap-y-3" alongside the action buttons
    const textBlocks = Array.from(panel.querySelectorAll('.leading-relaxed.select-text'));

    // Filter out thinking blocks by checking parent classes
    const finalBlocks = textBlocks.filter(el => {
      const parent = el.parentElement;
      return parent && parent.classList.contains('gap-y-3');
    });

    if (finalBlocks.length === 0) return '';

    // Get the LAST final block (most recent agent markdown response)
    const lastBlock = finalBlocks[finalBlocks.length - 1];
    const clone = lastBlock.cloneNode(true);
    clone.querySelectorAll('style, script').forEach(el => el.remove());
    return clone.textContent?.trim() || '';
  });
}

/** Get count of response blocks (both notify containers and markdown replies) */
async function getResponseBlockCount() {
  return workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return 0;
    const notifyCount = panel.querySelectorAll('.notify-user-container').length;
    const mdBlocks = Array.from(panel.querySelectorAll('.leading-relaxed.select-text'))
      .filter(el => el.parentElement && el.parentElement.classList.contains('gap-y-3'));
    return notifyCount + mdBlocks.length;
  });
}

/** Check if the agent is still running by looking for a VISIBLE spinner */
async function isAgentRunning() {
  return workbenchPage.evaluate((spinnerSel) => {
    const spinners = document.querySelectorAll(spinnerSel);
    for (const spinner of spinners) {
      // Walk up the tree to check if any ancestor has 'invisible' or 'opacity-0'
      let el = spinner;
      let hidden = false;
      while (el) {
        if (el.classList && (el.classList.contains('invisible') || el.classList.contains('opacity-0'))) {
          hidden = true;
          break;
        }
        el = el.parentElement;
      }
      if (!hidden) return true; // Found a truly visible spinner
    }
    return false;
  }, SELECTORS.spinner);
}

async function sendMessage(text) {
  console.log(`[Chat] Sending: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);

  // Click the input to focus it
  await workbenchPage.click(SELECTORS.chatInput);
  await sleep(200);

  // Clear existing content and set new text
  await workbenchPage.evaluate((sel, msg) => {
    const el = document.querySelector(sel);
    if (el) {
      el.textContent = '';
      el.focus();
      document.execCommand('insertText', false, msg);
    }
  }, SELECTORS.chatInput, text);
  await sleep(300);

  // Press Enter to send
  await workbenchPage.keyboard.press('Enter');
  console.log(`[Chat] Sent.`);
}

let isBusy = false;

async function waitForResponse(userMessage, timeoutMs = 180000) {
  const startTime = Date.now();
  const initialBlockCount = await getResponseBlockCount();
  console.log(`[Chat] Waiting for response... (initial blocks: ${initialBlockCount})`);

  // Phase 1: Wait for agent to start processing
  // Either the spinner appears OR we see a new response block
  let started = false;
  for (let i = 0; i < 40; i++) { // up to 12s
    await sleep(300);

    if (await isAgentRunning()) {
      console.log(`[Chat] Agent processing (spinner detected)`);
      started = true;
      break;
    }

    // If block count increased and spinner is gone, agent finished quickly
    const blocks = await getResponseBlockCount();
    if (blocks > initialBlockCount) {
      console.log(`[Chat] New response block(s) detected (${blocks} > ${initialBlockCount})`);
      started = true;
      // Wait a bit more to see if spinner appears (agent might still be running)
      await sleep(500);
      if (!await isAgentRunning()) {
        // Agent already finished! Read the response immediately
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

  // Phase 2: Wait for agent to finish (spinner gone + block count stable)
  let doneCount = 0;
  while (Date.now() - startTime < timeoutMs) {
    // Check for agent crash/error first
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
        // No response and no spinner — check for error one more time
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

  // Timeout — check for error before giving up
  const errorMsg = await checkForAgentError();
  if (errorMsg) {
    console.log(`[Chat] ❌ Timeout with agent error: ${errorMsg.substring(0, 80)}`);
    return errorMsg;
  }
  const response = await getAgentResponseText();
  console.log(`[Chat] ⏱ Timeout. Got ${response.length} chars`);
  return response || '[Timeout: No response received]';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── HTTP Server ────────────────────────────────────────────────────────

function startServer() {
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

    // Health check
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', connected: !!workbenchPage }));
      return;
    }

    // List available windows
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

    // Select a window
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

    // Send chat message (blocking)
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

    // SSE streaming chat
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

          await sendMessage(message);

          let lastSent = '';
          const startTime = Date.now();

          let doneCount = 0;
          const interval = setInterval(async () => {
            try {
              const running = await isAgentRunning();
              const responseText = await getAgentResponseText();

              if (responseText.length > 5 && responseText !== lastSent) {
                res.write(`data: ${JSON.stringify({ content: responseText, done: false })}\n\n`);
                lastSent = responseText;
              }

              if (!running) {
                doneCount++;
                if (doneCount >= 3) {
                  const finalText = await getAgentResponseText();
                  res.write(`data: ${JSON.stringify({ content: finalText, done: true })}\n\n`);
                  clearInterval(interval);
                  res.end();
                }
              } else {
                doneCount = 0;
              }

              if (Date.now() - startTime > 180000) {
                res.write(`data: ${JSON.stringify({ content: lastSent || '[Timeout]', done: true })}\n\n`);
                clearInterval(interval);
                res.end();
              }
            } catch (e) {
              clearInterval(interval);
              res.write(`data: ${JSON.stringify({ error: e.message, done: true })}\n\n`);
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

    // Serve web frontend
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getEmbeddedHTML());
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  // Disable default 120s timeout to allow long-running agent tool execution
  server.setTimeout(0);

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n[Server] ✅ Chat proxy running at http://0.0.0.0:${HTTP_PORT}`);
    console.log(`[Server] API:`);
    console.log(`  POST /api/chat           → Send message, get full response`);
    console.log(`  POST /api/chat/stream    → Send message, SSE stream`);
    console.log(`  GET  /api/windows        → List workbench windows`);
    console.log(`  POST /api/windows/select → Switch target window`);
    console.log(`  GET  /api/health         → Health check`);
    console.log(`  GET  /                   → Web chat UI\n`);
  });
}

function getEmbeddedHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Antigravity Agent</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #08080d;
      --bg-secondary: #0f0f1a;
      --bg-tertiary: #161625;
      --bg-hover: #1e1e33;
      --border: #1e1e33;
      --text: #e4e4ef;
      --text-dim: #8888aa;
      --accent: #6366f1;
      --accent-glow: rgba(99, 102, 241, 0.15);
      --green: #22c55e;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary); color: var(--text);
      height: 100dvh; display: flex; flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }
    
    /* Header */
    header {
      padding: 14px 20px; 
      background: linear-gradient(180deg, var(--bg-secondary), var(--bg-primary));
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 12px;
      flex-shrink: 0;
    }
    .logo {
      width: 32px; height: 32px; border-radius: 10px;
      background: linear-gradient(135deg, var(--accent), #a855f7);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; color: white;
    }
    header h1 { font-size: 1.1em; font-weight: 600; letter-spacing: -0.02em; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-right { margin-left: auto; }
    .status { font-size: 11px; color: var(--green); display: flex; align-items: center; gap: 5px; }
    .status::before {
      content: ""; width: 6px; height: 6px; border-radius: 50%;
      background: var(--green); display: inline-block;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    
    /* Window selector */
    #window-select {
      background: var(--bg-tertiary); color: var(--text);
      border: 1px solid var(--border); border-radius: 8px;
      padding: 6px 10px; font-family: inherit; font-size: 12px;
      cursor: pointer; outline: none; max-width: 200px;
      transition: border-color 0.2s;
    }
    #window-select:focus { border-color: var(--accent); }
    .window-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    
    /* Messages */
    #messages {
      flex: 1; overflow-y: auto; padding: 20px;
      display: flex; flex-direction: column; gap: 16px;
      scroll-behavior: smooth;
    }
    #messages:empty::after {
      content: "Send a message to start chatting with Antigravity";
      color: var(--text-dim); text-align: center;
      padding: 60px 20px; font-size: 14px;
    }
    .msg {
      max-width: 88%; padding: 12px 16px; border-radius: 14px;
      line-height: 1.65; font-size: 14px;
      white-space: pre-wrap; word-wrap: break-word;
      animation: fadeIn 0.25s ease-out;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .msg.user {
      align-self: flex-end; 
      background: linear-gradient(135deg, #4338ca, #6366f1);
      color: white; border-bottom-right-radius: 4px;
    }
    .msg.agent {
      align-self: flex-start;
      background: var(--bg-tertiary); border: 1px solid var(--border);
      border-bottom-left-radius: 4px;
    }
    .msg.agent.streaming {
      border-color: var(--accent);
      box-shadow: 0 0 20px var(--accent-glow);
    }
    .msg .label {
      font-size: 11px; font-weight: 600; margin-bottom: 6px;
      text-transform: uppercase; letter-spacing: 0.05em;
      opacity: 0.6;
    }
    
    /* Input */
    footer {
      padding: 12px 16px 16px; flex-shrink: 0;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
    }
    .input-row {
      display: flex; gap: 10px; align-items: flex-end;
      background: var(--bg-tertiary); border: 1px solid var(--border);
      border-radius: 14px; padding: 4px 4px 4px 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .input-row:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }
    #input {
      flex: 1; border: none; background: transparent; color: var(--text);
      font-family: inherit; font-size: 14px; resize: none; outline: none;
      padding: 10px 0; max-height: 120px;
    }
    #input::placeholder { color: var(--text-dim); }
    #send-btn {
      width: 40px; height: 40px; border-radius: 10px; border: none;
      background: linear-gradient(135deg, #4338ca, #6366f1);
      color: white; cursor: pointer; display: flex;
      align-items: center; justify-content: center;
      transition: opacity 0.2s, transform 0.1s;
      flex-shrink: 0;
    }
    #send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    #send-btn:hover:not(:disabled) { opacity: 0.85; }
    #send-btn:active:not(:disabled) { transform: scale(0.95); }
    #send-btn svg { width: 18px; height: 18px; }
    .hint { font-size: 11px; color: var(--text-dim); margin-top: 8px; text-align: center; }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <div class="logo">A</div>
      <div>
        <h1>Antigravity Agent</h1>
        <div class="status">Connected</div>
      </div>
    </div>
    <div class="header-right">
      <div class="window-label">Target Window</div>
      <select id="window-select" onchange="switchWindow(this.value)">
        <option>Loading...</option>
      </select>
    </div>
  </header>
  
  <div id="messages"></div>
  
  <footer>
    <div class="input-row">
      <textarea id="input" rows="1" placeholder="Ask the Antigravity agent..."
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
      <button id="send-btn" onclick="send()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
    <div class="hint">Enter to send · Shift+Enter for new line</div>
  </footer>
  
  <script>
    const msgs = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send-btn');
    const windowSelect = document.getElementById('window-select');
    
    // Load available windows on startup
    async function loadWindows() {
      try {
        const res = await fetch('/api/windows');
        const data = await res.json();
        windowSelect.innerHTML = '';
        data.windows.forEach(w => {
          const opt = document.createElement('option');
          opt.value = w.index;
          opt.textContent = w.title;
          opt.selected = w.active;
          windowSelect.appendChild(opt);
        });
      } catch (e) {
        windowSelect.innerHTML = '<option>Error loading</option>';
      }
    }
    loadWindows();
    
    async function switchWindow(idx) {
      try {
        await fetch('/api/windows/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index: parseInt(idx) })
        });
      } catch (e) { console.error(e); }
    }
    
    function addMsg(text, role) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = role === 'user' ? 'You' : 'Antigravity';
      div.appendChild(label);
      const content = document.createElement('div');
      content.textContent = text;
      div.appendChild(content);
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      return { div, content };
    }
    
    let sending = false;
    async function send() {
      const text = input.value.trim();
      if (!text || sending) return;
      sending = true;
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;
      
      addMsg(text, 'user');
      const { div: agentDiv, content: agentContent } = addMsg('Thinking...', 'agent streaming');
      
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        agentContent.textContent = data.response || data.error || 'No response';
      } catch (e) {
        agentContent.textContent = 'Error: ' + e.message;
      }
      
      agentDiv.classList.remove('streaming');
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  </script>
</body>
</html>`;
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
