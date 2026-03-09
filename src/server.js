/**
 * HTTP Server setup and route dispatching.
 * Creates the server, sets CORS headers, and delegates to route handlers.
 */

const http = require('http');

const { handleHealth } = require('./routes/health');
const { handleArtifacts } = require('./routes/artifacts');
const { handleConversations } = require('./routes/conversations');
const { handleWindows } = require('./routes/windows');
const { handleChat } = require('./routes/chat');
const { handleHITL } = require('./routes/hitl');
const { handleStatic } = require('./routes/static');

const HTTP_PORT = 3457;

function startServer(ctx) {
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

        // Route dispatch — order matters (most specific first)
        if (handleHealth(req, res, url, ctx)) return;
        if (await handleConversations(req, res, url, ctx)) return;
        if (await handleArtifacts(req, res, url, ctx)) return;
        if (await handleWindows(req, res, url, ctx)) return;
        if (await handleHITL(req, res, url, ctx)) return;
        if (await handleChat(req, res, url, ctx)) return;

        // Static files (catch-all)
        if (url.pathname.startsWith('/')) {
            handleStatic(req, res, url, ctx);
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
        console.log(`  POST /api/chat/new       → Start new chat in IDE`);
        console.log(`  GET  /api/conversations        → List conversations`);
        console.log(`  POST /api/conversations/select → Set active conversation`);
        console.log(`  GET  /api/conversations/active → Get active conversation`);
        console.log(`  GET  /api/windows        → List workbench windows`);
        console.log(`  POST /api/windows/select → Switch target window`);
        console.log(`  GET  /api/health         → Health check`);
        console.log(`  GET  /                   → Web chat UI\n`);
    });
}

module.exports = { startServer };
