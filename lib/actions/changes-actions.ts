/**
 * Changes Overview actions — Accept All / Reject All.
 *
 * These functions interact with the IDE's "Changes Overview" panel
 * to click the "Accept all" or "Reject all" buttons that appear
 * when there are file changes in the current conversation.
 *
 * Panel state detection:
 *   OPEN:   Gap container has a child with "File With Changes" text
 *   CLOSED: Gap container has a child with "Review Changes" text instead
 *
 * IMPORTANT: Uses the shared changes lock to prevent collisions with
 * the periodic changes scraper. We never close the panel after action
 * to prevent visible "flashing" for the user.
 */

import type { ProxyContext } from '../types';
import { withChangesLock } from '../scraper/changes-lock';

interface ActionResult {
  success: boolean;
  clicked?: string;
  error?: string;
}

/**
 * Helper: ensures the changes section is open, finds a button by text, clicks it.
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
      // Helper: dispatch proper mouse events for React compatibility
      function dispatchClick(el: Element) {
        const rect = el.getBoundingClientRect();
        const opts: MouseEventInit = {
          bubbles: true, cancelable: true, view: window,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
        };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }

      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return { success: false, error: 'No panel found' };

      const gapContainer = panel.querySelector('.flex.grow.flex-col.justify-start.gap-8');
      if (!gapContainer) return { success: false, error: 'No gap container' };

      // ── Detect panel state ──
      // Uses "File With Changes" which matches both singular and plural
      let section = Array.from(gapContainer.children).find(c =>
        (c.textContent || '').includes('File With Changes')
      ) as HTMLElement | undefined;

      if (!section) {
        // Panel is CLOSED — check if there are even changes to show
        const hasChanges = Array.from(gapContainer.children).some(c =>
          (c.textContent || '').includes('Review Changes')
        );
        if (!hasChanges) {
          return { success: false, error: 'No file changes in current conversation' };
        }

        // Open the panel via the tooltip button with dispatchEvent
        const toggleBtn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
        if (!toggleBtn) return { success: false, error: 'No changesOverview toggle button found' };

        dispatchClick(toggleBtn);

        // Wait for the section to appear (up to 5s)
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 250));
          section = Array.from(gapContainer.children).find(c =>
            (c.textContent || '').includes('File With Changes')
          ) as HTMLElement | undefined;
          if (section) break;
        }
      }

      if (!section) {
        // Could not open the panel — don't attempt to close, just return
        return { success: false, error: 'Changes section not found — no file changes?' };
      }

      // ── Find and click the target button ──
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

      // Strategy 3: look at ALL clickable elements
      if (!targetBtn) {
        const allElements = Array.from(section.querySelectorAll('*'));
        const matchEl = allElements.find(el => {
          const t = (el.textContent || '').trim().toLowerCase();
          return t === targetText && typeof (el as HTMLElement).click === 'function';
        }) as HTMLElement | undefined;
        if (matchEl) {
          dispatchClick(matchEl);
          // DO NOT close the panel — leave it open to prevent flashing
          return { success: true, clicked: (matchEl.textContent || '').trim() };
        }
      }

      if (targetBtn) {
        dispatchClick(targetBtn);
        // DO NOT close the panel — leave it open to prevent flashing
        return { success: true, clicked: (targetBtn.textContent || '').trim() };
      }

      // Debug: list all button texts found for troubleshooting
      const foundButtons = buttons.map(b => b.textContent?.trim()).filter(Boolean);

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

