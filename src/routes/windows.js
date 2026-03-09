/**
 * Route: Window management endpoints
 *   GET  /api/windows        — list workbench windows
 *   POST /api/windows/select — switch target window
 */

const { discoverWorkbenches, selectWindow } = require('../cdp');

async function handleWindows(req, res, url, ctx) {
    // GET /api/windows
    if (url.pathname === '/api/windows' && req.method === 'GET') {
        try {
            await discoverWorkbenches(ctx);
            const windows = ctx.allWorkbenches.map((w, i) => ({
                index: i, title: w.title, active: i === ctx.activeWindowIdx
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ windows }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return true;
    }

    // POST /api/windows/select
    if (url.pathname === '/api/windows/select' && req.method === 'POST') {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { index } = JSON.parse(body);
                    if (index === undefined) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'index is required' }));
                        resolve(true);
                        return;
                    }
                    await discoverWorkbenches(ctx);
                    const selected = selectWindow(ctx, index);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ selected: { index, title: selected.title } }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
                resolve(true);
            });
        });
    }

    return false;
}

module.exports = { handleWindows };
