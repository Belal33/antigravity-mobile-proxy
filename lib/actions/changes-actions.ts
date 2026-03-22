/**
 * Changes Overview actions — Accept All / Reject All.
 *
 * These functions interact with the IDE's "Changes Overview" panel
 * to click the "Accept all" or "Reject all" buttons that appear
 * when there are file changes in the current conversation.
 *
 * IMPORTANT: Uses the shared changes lock to prevent collisions with
 * the periodic changes scraper that also toggles the panel open/closed.
 */

import type { ProxyContext } from '../types';
import { withChangesLock } from '../scraper/changes-lock';

interface ActionResult {
  success: boolean;
  clicked?: string;
  error?: string;
}

/**
 * Helper: opens the changes section, finds a button by text, clicks it.
 * Shared logic between accept and reject.
 */
async function clickChangesButton(
  ctx: ProxyContext,
  buttonText: string // "accept all" or "reject all" (lowercase)
): Promise<ActionResult> {
  if (!ctx.workbenchPage) return { success: false, error: 'Not connected' };

  return withChangesLock(async () => {
    const page = ctx.workbenchPage!;

    return page.evaluate(async (targetText: string) => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return { success: false, error: 'No panel found' };

      const gapContainer = panel.querySelector('.flex.grow.flex-col.justify-start.gap-8');
      if (!gapContainer) return { success: false, error: 'No gap container' };

      // Check if the changes section is already visible
      let section = Array.from(gapContainer.children).find(c =>
        (c.textContent || '').includes('Files With Changes')
      ) as HTMLElement | undefined;

      let didOpen = false;

      if (!section) {
        // Toggle the changesOverview button to open it
        const toggleBtn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
        if (!toggleBtn) return { success: false, error: 'No changesOverview toggle button found' };

        toggleBtn.click();
        // Wait longer than the scraper — we really need the section
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 250));
          section = Array.from(gapContainer.children).find(c =>
            (c.textContent || '').includes('Files With Changes')
          ) as HTMLElement | undefined;
          if (section) break;
        }
        didOpen = true;
      }

      if (!section) {
        // Close if we opened but nothing appeared
        if (didOpen) {
          const toggleBtn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
          if (toggleBtn) toggleBtn.click();
        }
        return { success: false, error: 'Changes section not found — no file changes?' };
      }

      // Search strategies (broadening):
      // 1. Exact button text match
      // 2. Case-insensitive partial match
      // 3. Any clickable element with matching text
      const buttons = Array.from(section.querySelectorAll('button'));
      
      // Strategy 1: exact case-insensitive match on button text
      let targetBtn = buttons.find(b => {
        const t = (b.textContent || '').trim().toLowerCase();
        return t === targetText && !b.disabled;
      });

      // Strategy 2: partial match (button text contains target)
      if (!targetBtn) {
        targetBtn = buttons.find(b => {
          const t = (b.textContent || '').trim().toLowerCase();
          return t.includes(targetText) && !b.disabled;
        });
      }

      // Strategy 3: look at ALL elements, not just buttons
      if (!targetBtn) {
        const allElements = Array.from(section.querySelectorAll('*'));
        const matchEl = allElements.find(el => {
          const t = (el.textContent || '').trim().toLowerCase();
          return t === targetText && typeof (el as HTMLElement).click === 'function';
        }) as HTMLElement | undefined;
        if (matchEl) {
          matchEl.click();
          // Close if we opened
          if (didOpen) {
            await new Promise(r => setTimeout(r, 200));
            const toggleBtn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
            if (toggleBtn) toggleBtn.click();
          }
          return { success: true, clicked: (matchEl.textContent || '').trim() };
        }
      }

      if (targetBtn) {
        targetBtn.click();
        // Close if we opened
        if (didOpen) {
          await new Promise(r => setTimeout(r, 200));
          const toggleBtn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
          if (toggleBtn) toggleBtn.click();
        }
        return { success: true, clicked: (targetBtn.textContent || '').trim() };
      }

      // Debug: list all button texts found for troubleshooting
      const foundButtons = buttons.map(b => b.textContent?.trim()).filter(Boolean);

      // Close if we opened
      if (didOpen) {
        const toggleBtn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
        if (toggleBtn) toggleBtn.click();
      }

      return {
        success: false,
        error: `"${targetText}" button not found. Buttons in section: [${foundButtons.join(', ')}]`,
      };
    }, buttonText);
  });
}

/**
 * Click the "Accept all" button in the IDE's changes section.
 */
export async function clickAcceptAllChanges(ctx: ProxyContext): Promise<ActionResult> {
  return clickChangesButton(ctx, 'accept all');
}

/**
 * Click the "Reject all" button in the IDE's changes section.
 */
export async function clickRejectAllChanges(ctx: ProxyContext): Promise<ActionResult> {
  return clickChangesButton(ctx, 'reject all');
}
