/**
 * IDE Changes Overview Scraper
 *
 * Scrapes the "Changes Overview" section from the IDE's agent panel.
 * This section lists files that have been modified/created/deleted 
 * during the current conversation, with +additions/-deletions counts.
 *
 * DOM structure (when open):
 *   .flex.grow.flex-col.justify-start.gap-8
 *     └ div.relative.flex.flex-col.mb-2
 *       └ div.px-2 (header bar)
 *         └ div (the outline container)
 *           ├ span "N Files With Changes"
 *           ├ "Reject all" / "Accept all"
 *           └ div.pointer-events-none.absolute.bottom-full (dropdown)
 *             └ div.flex.flex-col (rows container)
 *               └ each row: [+][N][-][M] [filename] [filepath]
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

        // Check if the changes section is already visible
        let section = Array.from(gapContainer.children).find(c =>
          (c.textContent || '').includes('Files With Changes')
        ) as HTMLElement | undefined;

        let didOpen = false;

        if (!section) {
          // Toggle the changesOverview button to open it
          const btn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
          if (!btn) return { changes: [] as any[], totalCount: 0, error: 'no changesOverview button' };

          btn.click();
          // Wait for the section to appear
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 300));
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
            const btn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
            if (btn) btn.click();
          }
          return { changes: [] as any[], totalCount: 0 };
        }

        // Find the dropdown containing file rows
        const dropdown = section.querySelector(
          '.pointer-events-none.absolute.bottom-full .flex.flex-col'
        );

        const changes: any[] = [];

        if (dropdown) {
          const rows = Array.from(dropdown.children);
          for (const row of rows) {
            const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
            const texts: string[] = [];
            while (walker.nextNode()) {
              const t = (walker.currentNode.textContent || '').trim();
              if (t) texts.push(t);
            }

            // Parse: ["+"] ["N"] ["-"] ["M"] ["filename.ext"] ["path/to/filename.ext"]
            // The + and number may be separate text nodes
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
              if (t === '-') { minusSeen = true; continue; }

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

        // Get total count from header
        const headerSpan = section.querySelector('span');
        const headerText = headerSpan ? (headerSpan.textContent || '').trim() : '';
        const totalMatch = headerText.match(/^(\d+)/);
        const totalCount = totalMatch ? parseInt(totalMatch[1]) : changes.length;

        // Close the section if we opened it
        if (didOpen) {
          const btn = panel.querySelector('[data-tooltip-id="tooltip-changesOverview"]') as HTMLElement;
          if (btn) btn.click();
        }

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
