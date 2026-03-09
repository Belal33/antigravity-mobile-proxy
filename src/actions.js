/**
 * Message sending and HITL (Human-in-the-Loop) button interactions.
 */

const { SELECTORS } = require('./selectors');
const { sleep } = require('./utils');

/**
 * Send a chat message by typing into the Antigravity input and pressing Enter.
 */
async function sendMessage(ctx, text) {
    console.log(`[Chat] Sending: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);

    await ctx.workbenchPage.click(SELECTORS.chatInput);
    await sleep(200);

    await ctx.workbenchPage.evaluate((sel, msg) => {
        const el = document.querySelector(sel);
        if (el) {
            el.textContent = '';
            el.focus();
            document.execCommand('insertText', false, msg);
        }
    }, SELECTORS.chatInput, text);
    await sleep(300);

    await ctx.workbenchPage.keyboard.press('Enter');
    console.log(`[Chat] Sent.`);
}

/**
 * Click the approve/run/allow button in the HITL panel.
 */
async function clickApproveButton(ctx) {
    return ctx.workbenchPage.evaluate(() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return { success: false, error: 'No panel found' };

        // Look for common approval button patterns
        const buttons = Array.from(panel.querySelectorAll('button'));

        // Priority 1: explicit "Run" or "Approve" buttons
        for (const btn of buttons) {
            const text = btn.textContent?.trim().toLowerCase() || '';
            if ((text === 'run' || text === 'approve' || text === 'allow' || text === 'yes') && !btn.disabled) {
                btn.click();
                return { success: true, clicked: btn.textContent?.trim() };
            }
        }

        // Priority 2: Look for the action button in the HITL footer area
        const footers = panel.querySelectorAll('.rounded-b.border-t');
        for (const footer of footers) {
            const actionBtns = footer.querySelectorAll('button');
            for (const btn of actionBtns) {
                const text = btn.textContent?.trim().toLowerCase() || '';
                if (text !== 'cancel' && !btn.disabled) {
                    btn.click();
                    return { success: true, clicked: btn.textContent?.trim() };
                }
            }
        }

        return { success: false, error: 'No approve button found' };
    });
}

/**
 * Click the reject/cancel/deny button in the HITL panel.
 */
async function clickRejectButton(ctx) {
    return ctx.workbenchPage.evaluate(() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return { success: false, error: 'No panel found' };

        const buttons = Array.from(panel.querySelectorAll('button'));
        for (const btn of buttons) {
            const text = btn.textContent?.trim().toLowerCase() || '';
            if ((text === 'cancel' || text === 'reject' || text === 'deny') && !btn.disabled) {
                btn.click();
                return { success: true, clicked: btn.textContent?.trim() };
            }
        }

        return { success: false, error: 'No reject/cancel button found' };
    });
}

module.exports = { sendMessage, clickApproveButton, clickRejectButton };
