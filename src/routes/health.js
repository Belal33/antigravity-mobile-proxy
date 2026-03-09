/**
 * Route: GET /api/health
 */

function handleHealth(req, res, url, ctx) {
    if (url.pathname !== '/api/health') return false;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connected: !!ctx.workbenchPage }));
    return true;
}

module.exports = { handleHealth };
