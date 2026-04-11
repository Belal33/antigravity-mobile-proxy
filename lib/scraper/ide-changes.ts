/**
 * IDE Changes Overview Scraper
 *
 * Scrapes the "Changes Overview" section from the IDE's agent panel.
 * This section lists files that have been modified/created/deleted
 * during the current conversation, with +additions/-deletions counts.
 *
 * Panel states:
 *   CLOSED: Shows "Review Changes" button in the toolbar
 *   OPEN:   Shows "N File(s) With Changes" header with file list dropdown
 *
 * DOM structure (when open):
 *   .flex.grow.flex-col.justify-start.gap-8
 *     └ div.relative.flex.flex-col.mb-2
 *       └ div.px-2 (header bar)
 *         └ div.outline-solid (the outline container)
 *           ├ span "N File(s) With Changes"
 *           ├ "Reject all" / "Accept all"
 *           └ div.pointer-events-none.absolute.bottom-full (dropdown)
 *             └ div.pointer-events-auto (inner wrapper)
 *               └ div.max-h-80 (scrollable area)
 *                 └ div.flex.flex-col (rows container)
 *                   └ each row: [+N] [-M] [filename] [filepath]
 *
 * IMPORTANT: We never close the panel after reading. Once opened, we leave
 * it open so subsequent poll cycles read directly without toggling,
 * which eliminates the visible "flash" the user would see.
 */

import type { ProxyContext } from '../types';
import { withChangesLock } from './changes-lock';

export interface ChangeFile {
  filename: string;
  filepath: string;
  additions: number;
  deletions: number;
}

export interface IdeChangesResult {
  changes: ChangeFile[];
  totalCount: number;
}

export async function getIdeChanges(ctx: ProxyContext): Promise<IdeChangesResult> {
  const page = ctx.workbenchPage;
  if (!page) return { changes: [], totalCount: 0 };

  // Acquire exclusive access to the changes panel so we don't collide
  // with accept-all / reject-all actions that also toggle it.
  return withChangesLock(async () => {
    try {
      const result = await page.evaluate(async () => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return { changes: [] as any[], totalCount: 0, error: 'no panel' };

        // Find the gap-8 container that holds the changes section
        const gapContainer = panel.querySelector('.flex.grow.flex-col.justify-start.gap-8');
        if (!gapContainer) return { changes: [] as any[], totalCount: 0, error: 'no gap container' };

        // ── Detect panel state ──
        // OPEN:   A child of gapContainer contains "With Changes" (handles both "1 File" and "N Files")
        // CLOSED: A child contains "Review Changes" instead
        let section = Array.from(gapContainer.children).find(c =>
          (c.textContent || '').includes('With Changes') && !(c.textContent || '').includes('Review Changes')
        ) as HTMLElement | undefined;

        if (!section) {
          // Panel is CLOSED — check if there are even changes to show
          const hasChanges = Array.from(gapContainer.children).some(c =>
            (c.textContent || '').includes('Review Changes')
          );
          if (!hasChanges) {
            // No changes at all — nothing to scrape
            return { changes: [] as any[], totalCount: 0 };
          }

          // Click the changesOverview tooltip button to open the panel.
          // Use dispatchEvent with full mouse event sequence for React compatibility.
          const btn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
          if (!btn) return { changes: [] as any[], totalCount: 0, error: 'no changesOverview button' };

          const rect = btn.getBoundingClientRect();
          const evtOpts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.x + rect.width / 2,
            clientY: rect.y + rect.height / 2,
          };
          btn.dispatchEvent(new MouseEvent('mousedown', evtOpts));
          btn.dispatchEvent(new MouseEvent('mouseup', evtOpts));
          btn.dispatchEvent(new MouseEvent('click', evtOpts));

          // Wait for the section to appear (up to 3s)
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 300));
            section = Array.from(gapContainer.children).find(c =>
              (c.textContent || '').includes('With Changes') && !(c.textContent || '').includes('Review Changes')
            ) as HTMLElement | undefined;
            if (section) break;
          }
        }

        if (!section) {
          // Still couldn't open — don't try to close, just return empty
          return { changes: [] as any[], totalCount: 0 };
        }

        // ── Read file changes from the dropdown ──
        // The dropdown is inside the header bar:
        //   .pointer-events-none.absolute.bottom-full
        //     └ .pointer-events-auto (wrapper)
        //       └ .max-h-80 (scrollable)
        //         └ .flex.flex-col (rows)
        // Try multiple selectors for robustness
        let rowsContainer =
          section.querySelector('.pointer-events-none.absolute.bottom-full .flex.flex-col') ||
          section.querySelector('.pointer-events-none .flex.flex-col') ||
          section.querySelector('.max-h-80 .flex.flex-col');

        const changes: any[] = [];

        if (rowsContainer) {
          const rows = Array.from(rowsContainer.children);
          for (const row of rows) {
            const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
            const texts: string[] = [];
            while (walker.nextNode()) {
              const t = (walker.currentNode.textContent || '').trim();
              if (t) texts.push(t);
            }

            // Parse: ["+N"] ["-M"] ["filename.ext"] ["path/to/filename.ext"]
            // Tokens may be combined ("+28") or separate ("+" "28")
            let additions = 0, deletions = 0;
            let filename = '', filepath = '';

            let plusSeen = false, minusSeen = false;
            for (let i = 0; i < texts.length; i++) {
              const t = texts[i];

              // Handle "+N" as single token
              const addSingle = t.match(/^\+(\d+)$/);
              if (addSingle) { additions = parseInt(addSingle[1]); continue; }

              // Handle "-N" as single token
              const delSingle = t.match(/^-(\d+)$/);
              if (delSingle) { deletions = parseInt(delSingle[1]); continue; }

              // Handle "+" and number as separate tokens
              if (t === '+') { plusSeen = true; continue; }
              if (t === '-' || t === '−') { minusSeen = true; continue; }

              // Number after +/-
              if (plusSeen && t.match(/^\d+$/)) {
                additions = parseInt(t);
                plusSeen = false;
                continue;
              }
              if (minusSeen && t.match(/^\d+$/)) {
                deletions = parseInt(t);
                minusSeen = false;
                continue;
              }

              // File name (has extension)
              if (!filename && t.match(/\.\w{1,5}$/) && t.length < 100) {
                filename = t;
                continue;
              }

              // File path (contains /)
              if (filename && !filepath && t.includes('/')) {
                filepath = t;
              }
            }

            if (filename) {
              changes.push({ filename, filepath: filepath || filename, additions, deletions });
            }
          }
        }

        // Get total count from header span
        const headerSpan = section.querySelector('span');
        const headerText = headerSpan ? (headerSpan.textContent || '').trim() : '';
        const totalMatch = headerText.match(/^(\d+)/);
        const totalCount = totalMatch ? parseInt(totalMatch[1]) : changes.length;

        // ── DO NOT close the panel ──
        // Leaving it open means subsequent polls will find the section directly
        // without toggling, eliminating the visible "flash" for the user.

        return { changes, totalCount };
      });

      if (result.changes.length > 0) {
        console.log(`[INFO] [IdeChanges] Scraped ${result.changes.length}/${result.totalCount} file changes`);
      }

      return result;
    } catch (err: any) {
      console.error(`[ERROR] [IdeChanges] ${err.message}`);
      return { changes: [], totalCount: 0 };
    }
  });
}

