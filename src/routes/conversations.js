/**
 * Route: Conversation tracking endpoints
 *   GET  /api/conversations        — list all conversations with metadata
 *   POST /api/conversations/select — set active conversation
 *   GET  /api/conversations/active — get active conversation + artifacts
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

/**
 * Extract a human-readable title from task.md first heading line.
 */
function extractTitle(convDir) {
    const taskFile = path.join(convDir, 'task.md');
    try {
        if (fs.existsSync(taskFile)) {
            const content = fs.readFileSync(taskFile, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('# ')) {
                    return trimmed.slice(2).trim();
                }
            }
        }
    } catch { /* ignore read errors */ }
    return null;
}

/**
 * Scan a conversation directory and return file metadata.
 */
function getConversationFiles(convDir) {
    try {
        return fs.readdirSync(convDir)
            .filter(f => !f.startsWith('.') && fs.statSync(path.join(convDir, f)).isFile())
            .map(f => {
                const stat = fs.statSync(path.join(convDir, f));
                return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
            });
    } catch {
        return [];
    }
}

function handleConversations(req, res, url, ctx) {
    if (!url.pathname.startsWith('/api/conversations')) return false;

    // GET /api/conversations — list all
    if (url.pathname === '/api/conversations' && req.method === 'GET') {
        try {
            if (!fs.existsSync(BRAIN_DIR)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ conversations: [] }));
                return true;
            }
            const dirs = fs.readdirSync(BRAIN_DIR, { withFileTypes: true })
                .filter(d => d.isDirectory() && !d.name.startsWith('.'))
                .map(d => {
                    const dirPath = path.join(BRAIN_DIR, d.name);
                    const files = getConversationFiles(dirPath);
                    const title = extractTitle(dirPath);
                    const latestMtime = files.reduce((max, f) => {
                        const t = new Date(f.mtime).getTime();
                        return t > max ? t : max;
                    }, 0);
                    return {
                        id: d.name,
                        title,
                        files,
                        mtime: new Date(latestMtime).toISOString(),
                        active: d.name === ctx.activeConversationId,
                    };
                })
                .filter(c => c.files.length > 0)
                .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ conversations: dirs.slice(0, 50) }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return true;
    }

    // POST /api/conversations/select
    if (url.pathname === '/api/conversations/select' && req.method === 'POST') {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { id } = JSON.parse(body);
                    if (!id) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'id is required' }));
                        resolve(true);
                        return;
                    }
                    const convDir = path.join(BRAIN_DIR, id);
                    if (!fs.existsSync(convDir)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Conversation not found' }));
                        resolve(true);
                        return;
                    }
                    ctx.activeConversationId = id;
                    const files = getConversationFiles(convDir);
                    const title = extractTitle(convDir);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ id, title, files, active: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
                resolve(true);
            });
        });
    }

    // GET /api/conversations/active
    if (url.pathname === '/api/conversations/active' && req.method === 'GET') {
        if (!ctx.activeConversationId) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ active: false }));
            return true;
        }
        const convDir = path.join(BRAIN_DIR, ctx.activeConversationId);
        if (!fs.existsSync(convDir)) {
            ctx.activeConversationId = null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ active: false }));
            return true;
        }
        const files = getConversationFiles(convDir);
        const title = extractTitle(convDir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            active: true,
            id: ctx.activeConversationId,
            title,
            files,
        }));
        return true;
    }

    return false;
}

module.exports = { handleConversations };
