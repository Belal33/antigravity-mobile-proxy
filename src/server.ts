import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatProxy } from './chatProxy';

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

export class ChatProxyServer {
    private httpServer: http.Server | null = null;
    private chatProxy: ChatProxy;
    private webDir: string;

    constructor(
        private context: vscode.ExtensionContext,
        private host: string,
        private port: number
    ) {
        this.chatProxy = new ChatProxy();
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
                } else if (url.pathname === '/api/health') {
                    this.handleHealth(res);
                } else if (url.pathname === '/api/models') {
                    this.handleModels(res);
                } else {
                    this.serveStatic(url.pathname, res);
                }
            } catch (err) {
                console.error('[Chat Proxy] Request error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });

        this.httpServer.listen(this.port, this.host, () => {
            console.log(`[Chat Proxy] Server listening on ${this.host}:${this.port}`);
        });

        this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                vscode.window.showErrorMessage(
                    `Chat Proxy: Port ${this.port} is already in use. Change it in settings.`
                );
            } else {
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

    private handleHealth(res: http.ServerResponse) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            agent: 'antigravity',
            timestamp: new Date().toISOString()
        }));
    }

    private async handleModels(res: http.ServerResponse) {
        const config = vscode.workspace.getConfiguration('antigravity-chat-proxy');
        const model = config.get<string>('model', 'gemini-2.5-flash');
        const hasKey = !!config.get<string>('geminiApiKey', '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            models: [{ id: model, name: model, vendor: 'google', family: 'gemini' }],
            configured: hasKey,
        }));
    }

    private handleChatRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        let body = '';
        req.on('data', (chunk: Buffer) => {
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

                const sendEvent = (event: string, data: any) => {
                    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
                };

                sendEvent('status', { status: 'sending_to_agent' });

                try {
                    await this.chatProxy.sendMessage(
                        message,
                        mode || 'agent',
                        (chunk: string) => sendEvent('chunk', { text: chunk }),
                        (status: string) => sendEvent('status', { status }),
                    );
                    sendEvent('done', { status: 'complete' });
                } catch (err: any) {
                    sendEvent('error', { error: err.message || 'Agent error' });
                }

                res.end();
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
        });
    }

    private serveStatic(pathname: string, res: http.ServerResponse) {
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
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(indexData);
                        }
                    });
                } else {
                    res.writeHead(500);
                    res.end('Server error');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            }
        });
    }
}
