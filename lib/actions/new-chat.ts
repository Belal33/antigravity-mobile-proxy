/**
 * Start a new chat in the Antigravity IDE by clicking the new-chat button.
 */

import type { ProxyContext } from '../types';

export async function startNewChat(ctx: ProxyContext) {
  if (!ctx.workbenchPage)
    return { success: false, error: 'Not connected' };

  const btnResult = await ctx.workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel)
      return { success: false, error: 'No panel found' } as any;

    const allButtons = Array.from(panel.querySelectorAll('button'));

    const getCoords = (btn: Element, method: string) => {
      const rect = btn.getBoundingClientRect();
      return {
        success: true,
        method,
        clicked:
          (btn as HTMLElement).textContent?.trim() ||
          btn.getAttribute('aria-label') ||
          '+',
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };

    // Strategy 0: Exact match using known tooltip id
    const exactBtn = panel.querySelector(
      'a[data-tooltip-id="new-conversation-tooltip"]'
    );
    if (exactBtn) {
      if (
        exactBtn.classList.contains('cursor-not-allowed') ||
        exactBtn.classList.contains('disabled') ||
        getComputedStyle(exactBtn).opacity === '0.5'
      ) {
        return {
          success: true,
          method: 'tooltip-id-exact-disabled',
          clicked: 'Already in a new chat',
        };
      }
      return getCoords(exactBtn, 'tooltip-id-exact');
    }

    // Strategy 0.5: Structural match
    const header = panel.querySelector(
      '.title-actions, .actions-container, [class*="header"], [class*="titlebar"]'
    );
    if (header) {
      const headerBtns = Array.from(
        header.querySelectorAll('button, a.action-label')
      );
      if (headerBtns.length >= 4) {
        const target = headerBtns[headerBtns.length - 4];
        return getCoords(target, 'header-4th-from-right');
      }
    }

    // Strategy 1: aria-label or title
    for (const btn of allButtons) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const combined = aria + ' ' + title;
      if (combined.includes('new') || combined.includes('start') || combined.includes('create')) {
        if (
          combined.includes('chat') ||
          combined.includes('conversation') ||
          combined.includes('session') ||
          aria.includes('new') ||
          title.includes('new')
        ) {
          return getCoords(btn, 'aria/title');
        }
      }
    }



    return {
      success: false,
      error: 'No new-chat button found',
      buttonCount: allButtons.length,
    } as any;
  });

  if (btnResult.success && btnResult.x && btnResult.y) {
    await ctx.workbenchPage.mouse.click(btnResult.x, btnResult.y);
    await new Promise((r) => setTimeout(r, 100));
    return btnResult;
  } else if (
    btnResult.success &&
    btnResult.method === 'tooltip-id-exact-disabled'
  ) {
    return btnResult;
  }

  // Strategy 5: Keyboard shortcut fallback
  try {
    await ctx.workbenchPage.keyboard.down('Control');
    await ctx.workbenchPage.keyboard.press('l');
    await ctx.workbenchPage.keyboard.up('Control');
    return { success: true, method: 'keyboard-shortcut', clicked: 'Ctrl+L' };
  } catch (e: any) {
    return {
      success: false,
      error:
        'All strategies failed: ' + (btnResult.error || '') + ' | keyboard: ' + e.message,
    };
  }
}
