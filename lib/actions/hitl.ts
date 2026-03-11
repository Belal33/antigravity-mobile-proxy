/**
 * HITL (Human-in-the-Loop) button interactions.
 */

import type { ProxyContext } from '../types';

/**
 * Click the approve/run/allow button in the HITL panel.
 */
export async function clickApproveButton(ctx: ProxyContext) {
  if (!ctx.workbenchPage) return { success: false, error: 'Not connected' };

  return ctx.workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { success: false, error: 'No panel found' };

    const buttons = Array.from(panel.querySelectorAll('button'));

    for (const btn of buttons) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if (
        (text === 'run' ||
          text === 'approve' ||
          text === 'allow' ||
          text === 'yes') &&
        !btn.disabled
      ) {
        btn.click();
        return { success: true, clicked: btn.textContent?.trim() };
      }
    }

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
export async function clickRejectButton(ctx: ProxyContext) {
  if (!ctx.workbenchPage) return { success: false, error: 'Not connected' };

  return ctx.workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { success: false, error: 'No panel found' };

    const buttons = Array.from(panel.querySelectorAll('button'));
    for (const btn of buttons) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if (
        (text === 'cancel' || text === 'reject' || text === 'deny') &&
        !btn.disabled
      ) {
        btn.click();
        return { success: true, clicked: btn.textContent?.trim() };
      }
    }

    return { success: false, error: 'No reject/cancel button found' };
  });
}

/**
 * Click any footer button by toolId + buttonText.
 */
export async function clickActionButton(
  ctx: ProxyContext,
  toolId: string | null,
  buttonText: string
) {
  if (!ctx.workbenchPage) return { success: false, error: 'Not connected' };

  return ctx.workbenchPage.evaluate(
    (tid: string | null, btext: string) => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return { success: false, error: 'No panel found' };

      let searchRoot: Element = panel;
      if (tid) {
        const scoped = panel.querySelector(
          `[data-proxy-tool-id="${tid}"]`
        );
        if (scoped) searchRoot = scoped;
      }

      const buttons = Array.from(searchRoot.querySelectorAll('button'));
      const target = buttons.find((b) => {
        const t = b.textContent?.trim() || '';
        return t.toLowerCase() === btext.toLowerCase() && !b.disabled;
      });

      if (target) {
        target.click();
        return { success: true, clicked: target.textContent?.trim() };
      }
      return { success: false, error: `Button "${btext}" not found` };
    },
    toolId,
    buttonText
  );
}
