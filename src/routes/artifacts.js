/**
 * Route: Artifact endpoints
 *   GET /api/artifacts          — list all conversations with artifact files
 *   GET /api/artifacts/:convId  — list files in a conversation
 *   GET /api/artifacts/:convId/:filename — read a file
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

function handleArtifacts(req, res, url, ctx) {
    if (!url.pathname.startsWith('/api/artifacts')) return false;
    if (req.method !== 'GET') return false;

    // GET /api/artifacts — list all conversations
    if (url.pathname === '/api/artifacts') {
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
                    const files = fs.readdirSync(dirPath)
                        .filter(f => !f.startsWith('.') && fs.statSync(path.join(dirPath, f)).isFile())
                        .map(f => {
                            const stat = fs.statSync(path.join(dirPath, f));
                            return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
                        });
                    const latestMtime = files.reduce((max, f) => {
                        const t = new Date(f.mtime).getTime();
                        return t > max ? t : max;
                    }, 0);
                    return { id: d.name, files, mtime: new Date(latestMtime).toISOString() };
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

    // GET /api/artifacts/:convId or /api/artifacts/:convId/:filename
    const artifactMatch = url.pathname.match(/^\/api\/artifacts\/([a-f0-9-]+)(?:\/(.+))?$/);
    if (!artifactMatch) return false;

    const convId = artifactMatch[1];
    const fileName = artifactMatch[2];
    const convDir = path.join(BRAIN_DIR, convId);

    if (!fs.existsSync(convDir)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation not found' }));
        return true;
    }

    if (!fileName) {
        // List files
        const files = fs.readdirSync(convDir)
            .filter(f => !f.startsWith('.') && fs.statSync(path.join(convDir, f)).isFile())
            .map(f => {
                const stat = fs.statSync(path.join(convDir, f));
                return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
            });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: convId, files }));
        return true;
    }

    // Read file — sanitize filename to prevent path traversal
    const safeName = path.basename(fileName);
    const filePath = path.join(convDir, safeName);
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
        return true;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(safeName).toLowerCase();
    const contentType = ext === '.md' ? 'text/markdown' : ext === '.json' ? 'application/json' : 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType, 'X-Filename': safeName });
    res.end(content);
    return true;
}

module.exports = { handleArtifacts };
