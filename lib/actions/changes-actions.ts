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
      // Uses "With Changes" to match both "N Files With Changes" and "N File With Changes"
      // (the IDE always uses plural "Files" now, but we match broadly for safety)
      let section = Array.from(gapContainer.children).find(c => {
        const t = c.textContent || '';
        return t.includes('With Changes') && !t.includes('Review Changes');
      }) as HTMLElement | undefined;

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
          section = Array.from(gapContainer.children).find(c => {
            const t = c.textContent || '';
            return t.includes('With Changes') && !t.includes('Review Changes');
          }) as HTMLElement | undefined;
          if (section) break;
        }
      }

      if (!section) {
        // Could not open the panel — don't attempt to close, just return
        return { success: false, error: 'Changes section not found — no file changes?' };
      }

      // ── Find and click the target button ──
      // NOTE: The IDE renders "Accept all" and "Reject all" as clickable
      // <span> elements, NOT <button> elements. We must search both.
      const allClickables = Array.from(section.querySelectorAll('button, span[class*="cursor-pointer"]'));

      // Strategy 1: exact case-insensitive text match
      let targetBtn = allClickables.find(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === targetText && !(el as HTMLElement).hidden;
      }) as HTMLElement | undefined;

      // Strategy 2: partial match (element text contains target)
      if (!targetBtn) {
        targetBtn = allClickables.find(el => {
          const t = (el.textContent || '').trim().toLowerCase();
          return t.includes(targetText) && !(el as HTMLElement).hidden;
        }) as HTMLElement | undefined;
      }

      // Strategy 3: look at ALL elements with cursor-pointer class
      if (!targetBtn) {
        const allElements = Array.from(section.querySelectorAll('[class*="cursor-pointer"]'));
        const matchEl = allElements.find(el => {
          const t = (el.textContent || '').trim().toLowerCase();
          return t === targetText;
        }) as HTMLElement | undefined;
        if (matchEl) {
          dispatchClick(matchEl);
          return { success: true, clicked: (matchEl.textContent || '').trim() };
        }
      }

      if (targetBtn) {
        dispatchClick(targetBtn);
        return { success: true, clicked: (targetBtn.textContent || '').trim() };
      }

      // Debug: list all clickable element texts found for troubleshooting
      const foundElements = allClickables.map(el => el.textContent?.trim()).filter(Boolean);

      return {
        success: false,
        error: `"${targetText}" not found. Clickable elements in section: [${foundElements.join(', ')}]`,
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

