/**
 * Route: HITL (Human-in-the-Loop) endpoints
 *   POST /api/chat/approve  — click approve/run button
 *   POST /api/chat/reject   — click cancel/reject button
 *   POST /api/chat/action   — click any footer button by toolId + buttonText
 */

const { clickApproveButton, clickRejectButton, startNewChat } = require('../actions');

async function handleHITL(req, res, url, ctx) {
    if (req.method !== 'POST') return false;

    // POST /api/chat/new — start a new chat in the IDE
    if (url.pathname === '/api/chat/new') {
        try {
            if (!ctx.workbenchPage) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not connected' }));
                return true;
            }
            const result = await startNewChat(ctx);
            ctx.lastActionTimestamp = Date.now();
            res.writeHead(result.success ? 200 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return true;
    }

    // POST /api/chat/approve
    if (url.pathname === '/api/chat/approve') {
        try {
            if (!ctx.workbenchPage) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not connected' }));
                return true;
            }
            const result = await clickApproveButton(ctx);
            ctx.lastActionTimestamp = Date.now();
            res.writeHead(result.success ? 200 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return true;
    }

    // POST /api/chat/reject
    if (url.pathname === '/api/chat/reject') {
        try {
            if (!ctx.workbenchPage) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not connected' }));
                return true;
            }
            const result = await clickRejectButton(ctx);
            ctx.lastActionTimestamp = Date.now();
            res.writeHead(result.success ? 200 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return true;
    }

    // POST /api/chat/action
    if (url.pathname === '/api/chat/action') {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    if (!ctx.workbenchPage) {
                        res.writeHead(503, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Not connected' }));
                        resolve(true);
                        return;
                    }
                    const { toolId, buttonText } = JSON.parse(body);
                    if (!buttonText) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'buttonText is required' }));
                        resolve(true);
                        return;
                    }

                    const result = await ctx.workbenchPage.evaluate((toolId, buttonText) => {
                        const panel = document.querySelector('.antigravity-agent-side-panel');
                        if (!panel) return { success: false, error: 'No panel found' };

                        let searchRoot = panel;
                        if (toolId) {
                            const scoped = panel.querySelector(`[data-proxy-tool-id="${toolId}"]`);
                            if (scoped) searchRoot = scoped;
                        }

                        const buttons = Array.from(searchRoot.querySelectorAll('button'));
                        const target = buttons.find(b => {
                            const t = b.textContent?.trim() || '';
                            return t.toLowerCase() === buttonText.toLowerCase() && !b.disabled;
                        });

                        if (target) {
                            target.click();
                            return { success: true, clicked: target.textContent?.trim() };
                        }
                        return { success: false, error: `Button "${buttonText}" not found` };
                    }, toolId, buttonText);

                    res.writeHead(result.success ? 200 : 404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                    ctx.lastActionTimestamp = Date.now();
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
                resolve(true);
            });
        });
    }

    return false;
}

module.exports = { handleHITL };
