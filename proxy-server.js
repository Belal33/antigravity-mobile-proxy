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

const { connectToWorkbench } = require('./src/cdp');
const { startServer } = require('./src/server');

// Shared context — all modules read/write state through this object
const ctx = {
  workbenchPage: null,
  browser: null,
  allWorkbenches: [],
  activeWindowIdx: 0,
  activeConversationId: null,
  lastActionTimestamp: 0,
};

async function main() {
  try {
    await connectToWorkbench(ctx);
    startServer(ctx);
  } catch (e) {
    console.error('[Fatal]', e.message);
    process.exit(1);
  }
}

main();
