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
 * Search strategy (narrowest to widest):
 *   1. The element tagged with data-proxy-tool-id (and its immediate next sibling)
 *   2. The full agent panel as a fallback
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

      const matchBtn = (btn: HTMLButtonElement) => {
        const t = (btn.textContent || '').trim();
        // Case-insensitive exact match (handles "Allow Once" vs "allow once")
        return t.toLowerCase() === btext.toLowerCase() && !btn.disabled;
      };

      // ── Search 1: Scoped to the tagged element and its next sibling ──
      if (tid) {
        const scoped = panel.querySelector(`[data-proxy-tool-id="${tid}"]`);
        if (scoped) {
          // Search inside the tagged element
          const insideBtns = Array.from(scoped.querySelectorAll('button')) as HTMLButtonElement[];
          const inside = insideBtns.find(matchBtn);
          if (inside) {
            inside.click();
            return { success: true, clicked: inside.textContent?.trim() };
          }

          // Search in next sibling (permission bars often render just after the tool row)
          const nextSib = scoped.nextElementSibling;
          if (nextSib) {
            const sibBtns = Array.from(nextSib.querySelectorAll('button')) as HTMLButtonElement[];
            const sibBtn = sibBtns.find(matchBtn);
            if (sibBtn) {
              sibBtn.click();
              return { success: true, clicked: sibBtn.textContent?.trim() };
            }
          }

          // Search in prev sibling too
          const prevSib = scoped.previousElementSibling;
          if (prevSib) {
            const prevBtns = Array.from(prevSib.querySelectorAll('button')) as HTMLButtonElement[];
            const prevBtn = prevBtns.find(matchBtn);
            if (prevBtn) {
              prevBtn.click();
              return { success: true, clicked: prevBtn.textContent?.trim() };
            }
          }
        }
      }

      // ── Search 2: Full panel scan (permission may be floating anywhere) ──
      const allPanelBtns = Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[];
      const target = allPanelBtns.find(matchBtn);
      if (target) {
        target.click();
        return { success: true, clicked: target.textContent?.trim() };
      }

      return { success: false, error: `Button "${btext}" not found anywhere in panel` };
    },
    toolId,
    buttonText
  );
}

