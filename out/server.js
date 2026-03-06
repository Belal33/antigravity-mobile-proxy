"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatProxyServer = void 0;
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const chatProxy_1 = require("./chatProxy");
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};
class ChatProxyServer {
    constructor(context, host, port) {
        this.context = context;
        this.host = host;
        this.port = port;
        this.httpServer = null;
        this.chatProxy = new chatProxy_1.ChatProxy();
        this.webDir = path.join(context.extensionPath, 'web');
    }
    start() {
        if (this.httpServer) {
            console.log('[Chat Proxy] Server already running');
            return;
        }
        this.httpServer = http.createServer((req, res) => {
            // CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            try {
                if (url.pathname === '/api/chat' && req.method === 'POST') {
                    this.handleChatRequest(req, res);
                }
                else if (url.pathname === '/api/health') {
                    this.handleHealth(res);
                }
                else if (url.pathname === '/api/models') {
                    this.handleModels(res);
                }
                else {
                    this.serveStatic(url.pathname, res);
                }
            }
            catch (err) {
                console.error('[Chat Proxy] Request error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        this.httpServer.listen(this.port, this.host, () => {
            console.log(`[Chat Proxy] Server listening on ${this.host}:${this.port}`);
        });
        this.httpServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                vscode.window.showErrorMessage(`Chat Proxy: Port ${this.port} is already in use. Change it in settings.`);
            }
            else {
                vscode.window.showErrorMessage(`Chat Proxy error: ${err.message}`);
            }
        });
    }
    stop() {
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
            console.log('[Chat Proxy] Server stopped');
        }
    }
    handleHealth(res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            agent: 'antigravity',
            timestamp: new Date().toISOString()
        }));
    }
    async handleModels(res) {
        const config = vscode.workspace.getConfiguration('antigravity-chat-proxy');
        const model = config.get('model', 'gemini-2.5-flash');
        const hasKey = !!config.get('geminiApiKey', '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            models: [{ id: model, name: model, vendor: 'google', family: 'gemini' }],
            configured: hasKey,
        }));
    }
    handleChatRequest(req, res) {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { message, mode } = JSON.parse(body);
                if (!message || typeof message !== 'string') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing "message" field' }));
                    return;
                }
                // SSE headers
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                });
                const sendEvent = (event, data) => {
                    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
                };
                sendEvent('status', { status: 'sending_to_agent' });
                try {
                    await this.chatProxy.sendMessage(message, mode || 'agent', (chunk) => sendEvent('chunk', { text: chunk }), (status) => sendEvent('status', { status }));
                    sendEvent('done', { status: 'complete' });
                }
                catch (err) {
                    sendEvent('error', { error: err.message || 'Agent error' });
                }
                res.end();
            }
            catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
        });
    }
    serveStatic(pathname, res) {
        if (pathname === '/' || pathname === '') {
            pathname = '/index.html';
        }
        const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(this.webDir, safePath);
        // Ensure we don't serve files outside web dir
        if (!filePath.startsWith(this.webDir)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // Serve index.html for SPA routing
                    const indexPath = path.join(this.webDir, 'index.html');
                    fs.readFile(indexPath, (err2, indexData) => {
                        if (err2) {
                            res.writeHead(404);
                            res.end('Not found');
                        }
                        else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(indexData);
                        }
                    });
                }
                else {
                    res.writeHead(500);
                    res.end('Server error');
                }
            }
            else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            }
        });
    }
}
exports.ChatProxyServer = ChatProxyServer;
//# sourceMappingURL=server.js.map