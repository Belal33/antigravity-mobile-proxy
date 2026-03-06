# Implementation Steps — Antigravity Chat Proxy

This document describes the step-by-step implementation of the Antigravity Chat Proxy, covering the key technical decisions made during development.

---

## Phase 1: CDP Connection Setup

### 1.1 Enable Remote Debugging
```bash
# Must launch the Electron binary directly (not the shell wrapper)
killall antigravity
/usr/share/antigravity/antigravity --remote-debugging-port=9223 /path/to/project
```

**Lesson learned:** The `antigravity` CLI wrapper uses `ELECTRON_RUN_AS_NODE=1`, which routes all flags through Node.js's `cli.js` instead of Electron/Chromium. Only the direct binary path works.

### 1.2 Connect via Puppeteer
```javascript
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.connect({
    browserURL: `http://localhost:${CDP_PORT}`
});
```

### 1.3 Discover Workbench Windows
```javascript
const pages = await browser.pages();
const workbenches = pages.filter(p =>
    p.url().includes('workbench.html') && !p.url().includes('jetski')
);
```
**Why filter `jetski`?** Antigravity has a "Launchpad" page using `workbench-jetski-agent.html` — this is not a code editor window.

---

## Phase 2: Message Sending

### 2.1 Locate the Chat Input
```javascript
const SELECTOR = '#antigravity\\.agentSidePanelInputBox [contenteditable="true"][role="textbox"]';
```

### 2.2 Type and Submit
```javascript
await page.click(SELECTOR);
await page.evaluate((sel, msg) => {
    const el = document.querySelector(sel);
    el.textContent = '';
    el.focus();
    document.execCommand('insertText', false, msg);
}, SELECTOR, message);
await page.keyboard.press('Enter');
```
**Why `execCommand`?** The input is a `contenteditable` div, not a standard `<input>`. Direct `.textContent` assignment doesn't trigger React/VS Code's input handlers.

---

## Phase 3: Response Extraction

### 3.1 Identifying the Response Format
The agent's DOM has two types of text blocks, both using `.leading-relaxed.select-text`:

| Block Type | Parent | Contains |
|-----------|--------|----------|
| **Thinking** | Unclassed `<div>` | Internal reasoning, CSS snippets, tool output |
| **Final reply** | `.flex.flex-col.gap-y-3` | User-facing markdown response |

### 3.2 Extraction Logic
```javascript
// Get all text blocks
const textBlocks = panel.querySelectorAll('.leading-relaxed.select-text');

// Filter to final replies only
const finalBlocks = Array.from(textBlocks).filter(el =>
    el.parentElement?.classList.contains('gap-y-3')
);

// Get the last one (most recent)
const lastBlock = finalBlocks[finalBlocks.length - 1];

// Clean up embedded styles
const clone = lastBlock.cloneNode(true);
clone.querySelectorAll('style, script').forEach(e => e.remove());
return clone.textContent.trim();
```

### 3.3 Notify User Container
For explicit `notify_user` tool calls, the response appears in `.notify-user-container`. Check this first as a priority.

---

## Phase 4: Completion Detection

### 4.1 The Spinner Problem
Antigravity uses `.animate-spin` spinners — but they're **always in the DOM** (one per conversation step). They're hidden via Tailwind's `invisible opacity-0` classes, not `display: none`.

**Bug:** `offsetParent !== null` returns `true` for `visibility: hidden` elements. This made the proxy think the agent was perpetually running.

### 4.2 The Fix — Ancestor Class Walk
```javascript
async function isAgentRunning() {
    return page.evaluate((sel) => {
        const spinners = document.querySelectorAll(sel);
        for (const spinner of spinners) {
            let el = spinner;
            let hidden = false;
            while (el) {
                if (el.classList?.contains('invisible') ||
                    el.classList?.contains('opacity-0')) {
                    hidden = true;
                    break;
                }
                el = el.parentElement;
            }
            if (!hidden) return true; // truly visible spinner
        }
        return false;
    }, '.antigravity-agent-side-panel .animate-spin');
}
```

### 4.3 Two-Phase Wait Strategy
1. **Phase 1** (up to 12s): Wait for spinner to appear OR new response block count
2. **Phase 2** (up to 3 min): Poll every 500ms until spinner is gone for 3 consecutive checks

---

## Phase 5: Error Handling

### 5.1 Agent Crash Detection
```javascript
async function checkForAgentError() {
    const text = panel.textContent || '';
    if (text.includes('Agent terminated due to error')) {
        return '[Agent terminated due to error]';
    }
    return null;
}
```
Checked on every poll cycle during Phase 2 — returns immediately if detected.

### 5.2 HTTP Timeout
Node.js defaults to 120s connection timeout. Disabled with `server.setTimeout(0)` to support agent tasks that take several minutes.

---

## Phase 6: Multi-Window Support

### 6.1 API Endpoints
- `GET /api/windows` — Returns `{ windows: [{ index, title, active }] }`
- `POST /api/windows/select` — Body: `{ index: N }`

### 6.2 Web UI Integration
Added a `<select>` dropdown in the header that:
1. Fetches window list on page load
2. Switches target via `POST /api/windows/select` on change

---

## Phase 7: Web UI

Built-in chat interface served from `GET /` with:
- Dark theme (CSS custom properties, Inter font)
- Window selection dropdown
- Connected status indicator
- Message history (session-based)
- Shift+Enter for newlines, Enter to send
