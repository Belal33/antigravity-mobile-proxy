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

/**
 * Start a new chat in the Antigravity IDE by clicking the new-chat button.
 */
async function startNewChat(ctx) {
    // First, try to find and click the new-chat button in the IDE panel
    const btnResult = await ctx.workbenchPage.evaluate(() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return { success: false, error: 'No panel found' };

        const allButtons = Array.from(panel.querySelectorAll('button'));

        // Strategy 1: aria-label or title containing new/start/create chat keywords
        for (const btn of allButtons) {
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const combined = aria + ' ' + title;
            if (combined.includes('new') || combined.includes('start') || combined.includes('create')) {
                if (combined.includes('chat') || combined.includes('conversation') || combined.includes('session') ||
                    aria.includes('new') || title.includes('new')) {
                    btn.click();
                    return { success: true, method: 'aria/title', clicked: aria || title };
                }
            }
        }

        // Strategy 2: Text matching for common new-chat button labels
        for (const btn of allButtons) {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (text === '+' || text === 'new chat' || text === 'new conversation' ||
                text === 'start new chat' || text === 'new' || text === 'start chat') {
                btn.click();
                return { success: true, method: 'text', clicked: btn.textContent.trim() };
            }
        }

        // Strategy 3: SVG-based plus icon button (anywhere in panel, no parent restriction)
        for (const btn of allButtons) {
            const svg = btn.querySelector('svg');
            if (!svg) continue;

            // Check for <line> elements forming a plus sign
            const lines = svg.querySelectorAll('line');
            if (lines.length === 2) {
                btn.click();
                return { success: true, method: 'svg-plus', clicked: '+' };
            }

            // Check for <path> with a plus-sign d attribute (common in Lucide/Feather icons)
            const paths = svg.querySelectorAll('path');
            for (const p of paths) {
                const d = (p.getAttribute('d') || '').toLowerCase();
                if (d.includes('m12 5v14') || d.includes('m5 12h14') || // vertical + horizontal lines
                    (d.includes('12') && d.includes('5') && d.includes('19'))) {
                    btn.click();
                    return { success: true, method: 'svg-path-plus', clicked: '+' };
                }
            }
        }

        // Strategy 4: Search the broader page (outside the agent panel)
        const headerButtons = Array.from(document.querySelectorAll('.title-actions button, .actions-container button, [class*="titlebar"] button'));
        for (const btn of headerButtons) {
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            if (aria.includes('new') || title.includes('new')) {
                btn.click();
                return { success: true, method: 'page-header', clicked: aria || title };
            }
        }

        return { success: false, error: 'No new-chat button found', buttonCount: allButtons.length };
    });

    if (btnResult.success) return btnResult;

    // Strategy 5: Keyboard shortcut fallback — Ctrl+L is a common "new chat" shortcut in VS Code AI panels
    try {
        await ctx.workbenchPage.keyboard.down('Control');
        await ctx.workbenchPage.keyboard.press('l');
        await ctx.workbenchPage.keyboard.up('Control');
        return { success: true, method: 'keyboard-shortcut', clicked: 'Ctrl+L' };
    } catch (e) {
        return { success: false, error: 'All strategies failed: ' + (btnResult.error || '') + ' | keyboard: ' + e.message };
    }
}

module.exports = { sendMessage, clickApproveButton, clickRejectButton, startNewChat };
