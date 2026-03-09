/**
 * Route: Static file serving with SPA fallback
 */

const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

function handleStatic(req, res, url, ctx) {
    const webDir = path.join(__dirname, '..', '..', 'web');

    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(webDir, safePath);

    if (!fullPath.startsWith(webDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return true;
    }

    const ext = path.extname(fullPath);

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
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            res.end(data);
        }
    });
    return true;
}

module.exports = { handleStatic };
