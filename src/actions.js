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
    // First, try to find the new-chat button in the IDE panel and get its coordinates
    const btnResult = await ctx.workbenchPage.evaluate(() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return { success: false, error: 'No panel found' };

        const allButtons = Array.from(panel.querySelectorAll('button'));

        const getCoords = (btn, method) => {
            const rect = btn.getBoundingClientRect();
            return {
                success: true,
                method,
                clicked: (btn.textContent || '').trim() || btn.getAttribute('aria-label') || '+',
                x: rect.left + (rect.width / 2),
                y: rect.top + (rect.height / 2)
            };
        };

        // Strategy 0: Exact match using the known VS Code data-tooltip-id
        const exactBtn = panel.querySelector('a[data-tooltip-id="new-conversation-tooltip"]');
        if (exactBtn) {
            if (exactBtn.classList.contains('cursor-not-allowed') || exactBtn.classList.contains('disabled') || getComputedStyle(exactBtn).opacity === '0.5') {
                // Return success if already in a new chat (button disabled)
                return { success: true, method: 'tooltip-id-exact-disabled', clicked: 'Already in a new chat' };
            }
            return getCoords(exactBtn, 'tooltip-id-exact');
        }

        // Strategy 0.5: Structural match based on user hint
        // "fourth button from the right in the top head of the agent panel which contains four buttons"
        const header = panel.querySelector('.title-actions, .actions-container, [class*="header"], [class*="titlebar"]');
        if (header) {
            const headerBtns = Array.from(header.querySelectorAll('button, a.action-label'));
            if (headerBtns.length >= 4) {
                const target = headerBtns[headerBtns.length - 4]; // 4th from right
                return getCoords(target, 'header-4th-from-right');
            }
        }

        // Strategy 1: aria-label or title containing new/start/create chat keywords
        for (const btn of allButtons) {
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const combined = aria + ' ' + title;
            if (combined.includes('new') || combined.includes('start') || combined.includes('create')) {
                if (combined.includes('chat') || combined.includes('conversation') || combined.includes('session') ||
                    aria.includes('new') || title.includes('new')) {
                    return getCoords(btn, 'aria/title');
                }
            }
        }

        // Strategy 2: Text matching for common new-chat button labels
        for (const btn of allButtons) {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (text === '+' || text === 'new chat' || text === 'new conversation' ||
                text === 'start new chat' || text === 'new' || text === 'start chat') {
                return getCoords(btn, 'text');
            }
        }

        // Strategy 3: SVG-based plus icon button
        for (const btn of allButtons) {
            const svg = btn.querySelector('svg');
            if (!svg) continue;

            const lines = svg.querySelectorAll('line');
            if (lines.length === 2) return getCoords(btn, 'svg-plus');

            const paths = svg.querySelectorAll('path');
            for (const p of paths) {
                const d = (p.getAttribute('d') || '').toLowerCase();
                if (d.includes('m12 5v14') || d.includes('m5 12h14') ||
                    (d.includes('12') && d.includes('5') && d.includes('19'))) {
                    return getCoords(btn, 'svg-path-plus');
                }
            }
        }

        // Strategy 4: Search the broader page (outside the agent panel)
        const headerButtons = Array.from(document.querySelectorAll('.title-actions button, .actions-container button, [class*="titlebar"] button'));
        for (const btn of headerButtons) {
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            if (aria.includes('new') || title.includes('new')) {
                return getCoords(btn, 'page-header');
            }
        }

        return { success: false, error: 'No new-chat button found', buttonCount: allButtons.length };
    });

    if (btnResult.success && btnResult.x && btnResult.y) {
        // Use native CDP mouse click to bypass VS Code's DOM event restrictions
        await ctx.workbenchPage.mouse.click(btnResult.x, btnResult.y);

        // Small delay to let VS Code process the click
        await new Promise(r => setTimeout(r, 100));

        return btnResult;
    } else if (btnResult.success && btnResult.method === 'tooltip-id-exact-disabled') {
        return btnResult;
    }


    // Strategy 5: Keyboard shortcut fallback
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
