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

/**
 * Switches the active conversation in the IDE using CDP.
 * It does this by clicking the 'History' button in the agent panel
 * and then finding and clicking the conversation item matching the title.
 */
async function switchIdeConversation(ctx, conversationTitle) {
    if (!ctx.workbenchPage || !conversationTitle) return false;

    try {
        const success = await ctx.workbenchPage.evaluate(async (targetTitle) => {
            // 1. Check if the history panel is currently open
            // It usually appears as a drawer or changes state. We'll find the toggle button first.
            const historyBtn = document.querySelector('a[data-past-conversations-toggle="true"]');

            if (historyBtn) {
                // Determine if we need to click it. Look for a container that might be the history list
                const possibleHistoryPanels = Array.from(document.querySelectorAll('div')).filter(
                    el => el.textContent.includes('Today') || el.textContent.includes('Previous')
                );

                // If it doesn't seem open, click the toggle
                if (possibleHistoryPanels.length === 0) {
                    historyBtn.click();
                    // Wait a bit for the DOM to render the list
                    await new Promise(r => setTimeout(r, 200));
                }
            }

            // 2. Find the conversation item by text content
            const allElements = document.querySelectorAll('*');
            let matchedElement = null;

            for (let i = allElements.length - 1; i >= 0; i--) {
                const el = allElements[i];
                if (el.children.length === 0 && el.textContent && el.textContent.includes(targetTitle)) {
                    let clickable = el;
                    while (clickable && clickable !== document.body) {
                        const tag = clickable.tagName.toLowerCase();
                        const role = clickable.getAttribute('role');
                        if (tag === 'button' || tag === 'a' || role === 'button' || role === 'menuitem') {
                            matchedElement = clickable;
                            break;
                        }
                        if (tag === 'div' && clickable.className && clickable.className.includes('cursor-pointer')) {
                            matchedElement = clickable;
                            break;
                        }
                        clickable = clickable.parentElement;
                    }
                    if (matchedElement) break;
                }
            }

            // 3. Click the item if found
            if (matchedElement) {
                matchedElement.click();

                // Close the history panel if it's an overlay
                if (historyBtn) {
                    setTimeout(() => {
                        const panels = Array.from(document.querySelectorAll('div')).filter(
                            el => el.textContent.includes('Today') || el.textContent.includes('Previous')
                        );
                        if (panels.length > 0) historyBtn.click();
                    }, 100);
                }
                return true;
            }

            return false;
        }, conversationTitle);

        if (success) {
            // Give the IDE time to load the conversation DOM
            await sleep(500);
        }
        return success;
    } catch (e) {
        console.error('[Action] Error switching IDE conversation:', e);
        return false;
    }
}

module.exports = { sendMessage, clickApproveButton, clickRejectButton, startNewChat, switchIdeConversation };
