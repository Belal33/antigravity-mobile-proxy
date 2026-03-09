/**
 * Legacy helpers for the blocking /api/chat endpoint.
 * These pre-date the SSE streaming approach but are still used.
 */

const { SELECTORS } = require('./selectors');
const { sleep } = require('./utils');

async function getAgentResponseText(ctx) {
    return ctx.workbenchPage.evaluate(() => {
        const getClass = (el) => (el?.getAttribute ? el.getAttribute('class') : '') || '';
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return '';

        const notifyBlocks = panel.querySelectorAll('.notify-user-container');
        if (notifyBlocks.length > 0) {
            const lastBlock = notifyBlocks[notifyBlocks.length - 1];
            const clone = lastBlock.cloneNode(true);
            clone.querySelectorAll('style, script').forEach(el => el.remove());
            return clone.textContent?.trim() || '';
        }

        const textBlocks = Array.from(panel.querySelectorAll('.leading-relaxed.select-text'));
        const finalBlocks = textBlocks.filter(el => {
            let ancestor = el.parentElement;
            let depth = 0;
            while (ancestor && depth < 10) {
                const cls = getClass(ancestor);
                if (cls.includes('max-h-0')) return false;
                ancestor = ancestor.parentElement;
                depth++;
            }
            const text = el.textContent?.trim() || '';
            return !!text;
        });

        if (finalBlocks.length === 0) return '';
        const lastBlock = finalBlocks[finalBlocks.length - 1];
        const clone = lastBlock.cloneNode(true);
        clone.querySelectorAll('style, script').forEach(el => el.remove());
        return clone.textContent?.trim() || '';
    });
}

async function getResponseBlockCount(ctx) {
    return ctx.workbenchPage.evaluate(() => {
        const getClass = (el) => (el?.getAttribute ? el.getAttribute('class') : '') || '';
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return 0;
        const notifyCount = panel.querySelectorAll('.notify-user-container').length;
        const mdBlocks = Array.from(panel.querySelectorAll('.leading-relaxed.select-text'))
            .filter(el => {
                let ancestor = el.parentElement;
                let depth = 0;
                while (ancestor && depth < 10) {
                    const cls = (ancestor.getAttribute ? ancestor.getAttribute('class') : '') || '';
                    if (cls.includes('max-h-0')) return false;
                    ancestor = ancestor.parentElement;
                    depth++;
                }
                return !!(el.textContent?.trim());
            });
        return notifyCount + mdBlocks.length;
    });
}

async function isAgentRunning(ctx) {
    return ctx.workbenchPage.evaluate((spinnerSel) => {
        const spinners = document.querySelectorAll(spinnerSel);
        for (const spinner of spinners) {
            let el = spinner;
            let hidden = false;
            while (el) {
                const cls = el.getAttribute ? el.getAttribute('class') : '';
                if (cls && (cls.includes('invisible') || cls.includes('opacity-0'))) {
                    hidden = true;
                    break;
                }
                el = el.parentElement;
            }
            if (!hidden) return true;
        }
        return false;
    }, SELECTORS.spinner);
}

async function checkForAgentError(ctx) {
    return ctx.workbenchPage.evaluate(() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return null;
        const text = panel.textContent || '';
        const errorPatterns = ['Agent terminated due to error', 'error persists', 'start a new conversation'];
        for (const pattern of errorPatterns) {
            if (text.includes(pattern)) {
                const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, null, false);
                let n;
                while (n = walk.nextNode()) {
                    if (n.textContent.includes('Agent terminated')) return n.textContent.trim();
                }
                return '[Agent terminated due to error]';
            }
        }
        return null;
    });
}

async function waitForResponse(ctx, userMessage, timeoutMs = 180000) {
    const startTime = Date.now();
    const initialBlockCount = await getResponseBlockCount(ctx);
    console.log(`[Chat] Waiting for response... (initial blocks: ${initialBlockCount})`);

    // Phase 1: Wait for agent to start
    let started = false;
    for (let i = 0; i < 40; i++) {
        await sleep(300);
        if (await isAgentRunning(ctx)) {
            console.log(`[Chat] Agent processing (spinner detected)`);
            started = true;
            break;
        }
        const blocks = await getResponseBlockCount(ctx);
        if (blocks > initialBlockCount) {
            console.log(`[Chat] New response block(s) detected (${blocks} > ${initialBlockCount})`);
            started = true;
            await sleep(500);
            if (!await isAgentRunning(ctx)) {
                const response = await getAgentResponseText(ctx);
                console.log(`[Chat] ✅ Quick response (${response.length} chars)`);
                return response;
            }
            break;
        }
    }

    if (!started) {
        console.log(`[Chat] Warning: agent never started, returning current content`);
        return await getAgentResponseText(ctx) || '[Agent did not respond]';
    }

    // Phase 2: Wait for completion
    let doneCount = 0;
    while (Date.now() - startTime < timeoutMs) {
        const errorMsg = await checkForAgentError(ctx);
        if (errorMsg) {
            console.log(`[Chat] ❌ Agent error detected: ${errorMsg.substring(0, 80)}`);
            return errorMsg;
        }

        const running = await isAgentRunning(ctx);
        if (!running) {
            doneCount++;
            if (doneCount >= 3) {
                const response = await getAgentResponseText(ctx);
                if (response) {
                    console.log(`[Chat] ✅ Response complete (${response.length} chars)`);
                    return response;
                }
                const err = await checkForAgentError(ctx);
                if (err) {
                    console.log(`[Chat] ❌ Agent error: ${err.substring(0, 80)}`);
                    return err;
                }
                console.log(`[Chat] ⚠ Agent stopped but no response found`);
                return '[Agent did not produce a response]';
            }
        } else {
            doneCount = 0;
        }
        await sleep(500);
    }

    const errorMsg = await checkForAgentError(ctx);
    if (errorMsg) return errorMsg;
    const response = await getAgentResponseText(ctx);
    console.log(`[Chat] ⏱ Timeout. Got ${response.length} chars`);
    return response || '[Timeout: No response received]';
}

module.exports = {
    getAgentResponseText,
    getResponseBlockCount,
    isAgentRunning,
    checkForAgentError,
    waitForResponse,
};
