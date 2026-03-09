/**
 * Route: Chat endpoints
 *   GET  /api/chat/state   — get current agent panel state
 *   GET  /api/debug/dom    — DOM diagnostic
 *   POST /api/chat         — send message, blocking response
 *   POST /api/chat/stream  — send message, SSE stream
 */

const { getFullAgentState } = require('../scraper');
const { sendMessage } = require('../actions');
const { waitForResponse } = require('../legacy');
const { diffStates } = require('../diff');

async function handleChat(req, res, url, ctx) {
    // GET /api/chat/state
    if (url.pathname === '/api/chat/state' && req.method === 'GET') {
        try {
            if (!ctx.workbenchPage) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not connected to Antigravity' }));
                return true;
            }
            const state = await getFullAgentState(ctx);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return true;
    }

    // GET /api/debug/dom
    if (url.pathname === '/api/debug/dom' && req.method === 'GET') {
        try {
            if (!ctx.workbenchPage) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not connected' }));
                return true;
            }
            const debug = await ctx.workbenchPage.evaluate(() => {
                const panel = document.querySelector('.antigravity-agent-side-panel');
                if (!panel) return { error: 'No panel' };
                const conv = panel.querySelector('#conversation');
                const scrollArea = conv?.querySelector('.overflow-y-auto');
                const msgList = scrollArea?.querySelector('.mx-auto');
                const turns = msgList ? msgList.children.length : 0;
                const lastTurn = msgList?.lastElementChild;
                const contentDiv = lastTurn?.querySelector('.relative.flex.flex-col.gap-y-3') || lastTurn;
                const toolEls = panel.querySelectorAll('.flex.flex-col.gap-2.border.rounded-lg.my-1');
                const responseEls = panel.querySelectorAll('.leading-relaxed.select-text');
                return {
                    panelTextLen: panel.textContent?.length || 0,
                    hasConversation: !!conv,
                    hasScrollArea: !!scrollArea,
                    hasMsgList: !!msgList,
                    turnCount: turns,
                    hasContentDiv: !!contentDiv,
                    stepGroupCount: contentDiv?.children?.length || 0,
                    toolContainerCount: toolEls.length,
                    toolContainers: Array.from(toolEls).map(el => ({
                        cls: (el.className || '').substring(0, 200),
                        text: (el.textContent || '').substring(0, 80),
                    })),
                    responseBlockCount: responseEls.length,
                };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(debug, null, 2));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return true;
    }

    // POST /api/chat (blocking)
    if (url.pathname === '/api/chat' && req.method === 'POST') {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { message } = JSON.parse(body);
                    if (!message) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'message is required' }));
                        resolve(true);
                        return;
                    }
                    if (!ctx.workbenchPage) {
                        res.writeHead(503, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Not connected to Antigravity' }));
                        resolve(true);
                        return;
                    }

                    await sendMessage(ctx, message);
                    const response = await waitForResponse(ctx, message);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ response }));
                } catch (e) {
                    console.error('[Server] Error:', e.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
                resolve(true);
            });
        });
    }

    // POST /api/chat/stream (SSE)
    if (url.pathname === '/api/chat/stream' && req.method === 'POST') {
        return new Promise((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { message } = JSON.parse(body);
                    if (!message || !ctx.workbenchPage) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'message required and connection needed' }));
                        resolve(true);
                        return;
                    }

                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });

                    const writeEvent = (type, data) => {
                        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
                    };

                    writeEvent('status', { isRunning: true, phase: 'sending' });

                    // Capture initial state before sending
                    let prevState = await getFullAgentState(ctx);
                    let sessionToolCalls = new Map();
                    let sessionResponses = [];

                    await sendMessage(ctx, message);

                    writeEvent('status', { isRunning: true, phase: 'waiting' });

                    const startTime = Date.now();
                    let doneCount = 0;
                    let started = false;
                    let lastStableHTML = '';
                    const initialTurnCount = prevState.turnCount;

                    const interval = setInterval(async () => {
                        try {
                            const currState = await getFullAgentState(ctx);

                            // Track tools by ID to prevent virtualization from shrinking the array
                            if (currState.turnCount > prevState.turnCount) {
                                sessionToolCalls.clear();
                                prevState.toolCalls = [];
                                prevState.responses = [];
                                prevState.thinking = [];
                                prevState.notifications = [];
                                prevState.fileChanges = [];
                            }
                            for (const t of currState.toolCalls) {
                                sessionToolCalls.set(t.id, t);
                            }
                            currState.toolCalls = Array.from(sessionToolCalls.values());

                            // Accumulate responses: survive DOM virtualization
                            if (currState.responses.length > sessionResponses.length) {
                                sessionResponses = [...currState.responses];
                            } else if (currState.responses.length < sessionResponses.length && currState.responses.length > 0) {
                                const lastIdx = currState.responses.length - 1;
                                sessionResponses[sessionResponses.length - 1] = currState.responses[lastIdx];
                            } else if (currState.responses.length === sessionResponses.length && currState.responses.length > 0) {
                                sessionResponses[sessionResponses.length - 1] = currState.responses[currState.responses.length - 1];
                            }
                            currState.responses = [...sessionResponses];

                            // Detect start via multiple signals
                            if (!started) {
                                if (currState.isRunning ||
                                    currState.turnCount > initialTurnCount ||
                                    currState.toolCalls.length > prevState.toolCalls.length ||
                                    currState.responses.length > prevState.responses.length ||
                                    currState.thinking.length > prevState.thinking.length) {
                                    started = true;
                                    writeEvent('status', { isRunning: true, phase: 'processing' });
                                }
                            }

                            // Check for unresolved tools in the SESSION
                            const hasUnresolvedTools = Array.from(sessionToolCalls.values()).some(t => {
                                return t.hasCancelBtn && !t.exitCode;
                            });

                            // Compute and emit diffs
                            const events = diffStates(prevState, currState);
                            if (currState.toolCalls.length > 0 || prevState.toolCalls.length > 0) {
                                console.log(`[SSE Debug] toolCalls: prev=${prevState.toolCalls.length}, curr=${currState.toolCalls.length}, events=${events.filter(e => e.type === 'tool_call').length}`);
                            }
                            for (const evt of events) {
                                if (evt.type === 'tool_call') {
                                    console.log(`[SSE Debug] Emitting tool_call event:`, JSON.stringify({ index: evt.data.index, isNew: evt.data.isNew, status: evt.data.status, id: evt.data.id }));
                                }
                                writeEvent(evt.type, evt.data);
                            }

                            // Check for completion
                            if (started && !currState.isRunning && !currState.error && !hasUnresolvedTools) {
                                const contentChanged = (
                                    currState.toolCalls.length !== prevState.toolCalls.length ||
                                    currState.responses.length !== prevState.responses.length ||
                                    currState.thinking.length !== prevState.thinking.length ||
                                    currState.notifications.length !== prevState.notifications.length ||
                                    currState.fileChanges.length !== prevState.fileChanges.length ||
                                    currState.stepGroupCount !== prevState.stepGroupCount ||
                                    (currState.responses.length > 0 && prevState.responses.length > 0 &&
                                        currState.responses[currState.responses.length - 1] !== prevState.responses[prevState.responses.length - 1]) ||
                                    currState.lastTurnResponseHTML !== prevState.lastTurnResponseHTML
                                );

                                if (contentChanged) {
                                    doneCount = 0;
                                    lastStableHTML = '';
                                } else if (Date.now() - ctx.lastActionTimestamp < 15000) {
                                    doneCount = 0;
                                    lastStableHTML = '';
                                } else {
                                    doneCount++;
                                }

                                const currentHTML = currState.lastTurnResponseHTML || '';
                                if (doneCount >= 2 && currentHTML && currentHTML !== lastStableHTML) {
                                    doneCount = 1;
                                }
                                lastStableHTML = currentHTML;

                                const hasSubagentTools = currState.toolCalls.some(t =>
                                    t.type === 'browser' || (t.status || '').toLowerCase().includes('subagent') ||
                                    (t.status || '').toLowerCase().includes('navigat')
                                );
                                const requiredDoneCount = hasSubagentTools ? 20 : 10;
                                if (doneCount >= requiredDoneCount) {
                                    const finalResponse = currState.notifications.length > 0
                                        ? currState.notifications[currState.notifications.length - 1]
                                        : currState.responses.length > 0
                                            ? currState.responses[currState.responses.length - 1]
                                            : '';

                                    writeEvent('done', {
                                        finalResponse,
                                        isHTML: true,
                                        thinking: currState.thinking,
                                        toolCalls: currState.toolCalls,
                                    });
                                    clearInterval(interval);
                                    res.end();
                                    resolve(true);
                                    return;
                                }
                            } else {
                                doneCount = 0;
                                lastStableHTML = '';
                            }

                            // Error
                            if (currState.error) {
                                writeEvent('error', { message: currState.error });
                                writeEvent('done', { error: currState.error });
                                clearInterval(interval);
                                res.end();
                                resolve(true);
                                return;
                            }

                            // Timeout (10 min)
                            if (Date.now() - startTime > 600000) {
                                const finalResponse = currState.responses.length > 0
                                    ? currState.responses[currState.responses.length - 1]
                                    : '[Timeout]';
                                writeEvent('done', { finalResponse, timeout: true });
                                clearInterval(interval);
                                res.end();
                                resolve(true);
                                return;
                            }

                            prevState = currState;
                        } catch (e) {
                            writeEvent('error', { message: e.message });
                            clearInterval(interval);
                            res.end();
                            resolve(true);
                        }
                    }, 500);

                    req.on('close', () => {
                        clearInterval(interval);
                        resolve(true);
                    });
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                    resolve(true);
                }
            });
        });
    }

    return false;
}

module.exports = { handleChat };
