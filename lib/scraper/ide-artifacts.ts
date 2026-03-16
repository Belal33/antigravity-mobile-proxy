/**
 * Scrapes the artifact list directly from the Antigravity IDE's conversation panel.
 *
 * The IDE maintains a "tooltip-artifacts" toggle button in the input toolbar.
 * Clicking it reveals a section headed "Artifacts (N Files for Conversation)"
 * with rows showing artifact names and last-updated timestamps.
 *
 * By scraping this section we get the EXACT artifacts for the current
 * conversation — no more cross-conversation mixing.
 */

import type { ProxyContext } from '../types';
import { logger } from '../logger';

export interface IdeArtifact {
  /** Display name, e.g. "task.md" or "Pricing Blue Cards" */
  name: string;
  /** Raw timestamp text from the IDE, e.g. "Mar 10 11:21 PM" */
  lastUpdated: string | null;
  /** Whether this looks like a file (has an extension) */
  isFile: boolean;
}

export interface IdeArtifactResult {
  /** Total count stated in the section header */
  totalCount: number;
  /** Scraped artifact entries */
  artifacts: IdeArtifact[];
  /** The conversation title at the time of scraping */
  conversationTitle: string | null;
}

/**
 * Get the list of artifacts from the IDE's conversation panel.
 *
 * Strategy:
 *  1. Check whether the artifact section is already visible.
 *  2. If not, click `[data-tooltip-id="tooltip-artifacts"]` to toggle it open.
 *  3. Parse the rows to extract artifact names and timestamps.
 *  4. Close the section again (toggle) to leave the IDE clean.
 */
export async function getIdeArtifacts(ctx: ProxyContext): Promise<IdeArtifactResult> {
  if (!ctx.workbenchPage) {
    logger.info('[IdeArtifacts] No active workbench page.');
    return { totalCount: 0, artifacts: [], conversationTitle: null };
  }

  try {
    const result = await ctx.workbenchPage.evaluate(async () => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return { error: 'No agent panel found' };

      // Get current conversation title
      const titleEl = panel.querySelector('span.font-semibold.text-ide-text-color');
      const conversationTitle = titleEl?.textContent?.trim() || null;

      // Check whether the artifact section is already open
      const findArtifactHeader = (): Element | null => {
        for (const el of panel.querySelectorAll('*')) {
          const t = (el.textContent || '').trim();
          if (
            t.startsWith('Artifacts (') &&
            t.includes('Files') &&
            el.children.length <= 3
          ) {
            return el;
          }
        }
        return null;
      };

      let header = findArtifactHeader();
      let didOpen = false;

      if (!header) {
        // Click the artifact button to open the section
        const btn = panel.querySelector('[data-tooltip-id="tooltip-artifacts"]');
        if (!btn) return { error: 'No artifact button (tooltip-artifacts) found' };

        (btn as HTMLElement).click();
        await new Promise(r => setTimeout(r, 1500));
        header = findArtifactHeader();
        didOpen = true;
      }

      if (!header) {
        return { error: 'Artifact section did not appear after clicking' };
      }

      // Parse total count from header like "Artifacts (15 Files for Conversation)"
      const headerText = header.textContent?.trim() || '';
      const countMatch = headerText.match(/Artifacts\s*\((\d+)\s*Files?/);
      const totalCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      // Find the section container — walk up until we find the container
      // that holds the header AND the file rows
      let section = header as HTMLElement;
      for (let i = 0; i < 8; i++) {
        if (!section.parentElement) break;
        section = section.parentElement;
        const text = section.textContent || '';
        if (text.includes('Artifact Name') && text.includes('Last Updated')) {
          break;
        }
      }

      // Extract artifact rows — each row has a name and a date
      // Strategy: find all visible row-like flex containers within the section
      const rows = section.querySelectorAll(
        '.flex.w-full.flex-row.items-center.justify-between'
      );

      const artifacts: Array<{ name: string; lastUpdated: string | null }> = [];

      for (const row of rows) {
        const cells = row.children;
        if (cells.length < 2) continue;

        const nameText = (cells[0].textContent || '').trim();
        const dateText = (cells[1].textContent || '').trim();

        // Skip the header row itself
        if (nameText === 'Artifact Name' || !nameText) continue;

        artifacts.push({ name: nameText, lastUpdated: dateText || null });
      }

      // Fallback: if no rows found via flex layout, try extracting from text nodes
      if (artifacts.length === 0) {
        // Use TreeWalker to find file-name and date text nodes
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        const allTexts: string[] = [];
        while (walker.nextNode()) {
          const t = walker.currentNode.textContent?.trim();
          if (t && t.length > 0) allTexts.push(t);
        }

        // Parse pairs: artifact name followed by date
        for (let i = 0; i < allTexts.length; i++) {
          const text = allTexts[i];
          // Skip header/control texts
          if (
            text === 'Artifact Name' ||
            text === 'Last Updated' ||
            text.startsWith('Artifacts (') ||
            text === 'Review Changes'
          ) {
            continue;
          }

          // Check if this has a date pattern like "Mar 10 11:21 PM"
          const dateMatch = text.match(
            /\(([A-Z][a-z]{2}\s+\d{1,2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)\)$/
          );
          if (dateMatch) {
            const name = text.replace(dateMatch[0], '').trim();
            artifacts.push({ name, lastUpdated: dateMatch[1] });
          } else if (
            text.match(
              /\.(md|json|txt|ts|tsx|js|jsx|css|html|yaml|yml|py|sh)$/
            )
          ) {
            // It's a file name — check if next text is a date
            const nextText = allTexts[i + 1] || '';
            const nextDate = nextText.match(
              /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{1,2}:\d{2}/
            );
            artifacts.push({
              name: text,
              lastUpdated: nextDate ? nextText : null,
            });
            if (nextDate) i++; // Skip the date we already consumed
          }
        }
      }

      // Close the section if we opened it (toggle back)
      if (didOpen) {
        const btn = panel.querySelector('[data-tooltip-id="tooltip-artifacts"]');
        if (btn) (btn as HTMLElement).click();
      }

      return { conversationTitle, totalCount, artifacts };
    });

    if (result && 'error' in result) {
      logger.error(`[IdeArtifacts] ${result.error}`);
      return { totalCount: 0, artifacts: [], conversationTitle: null };
    }

    const artifacts: IdeArtifact[] = (result?.artifacts || []).map(
      (a: { name: string; lastUpdated: string | null }) => ({
        name: a.name,
        lastUpdated: a.lastUpdated,
        isFile: /\.\w{1,5}$/.test(a.name),
      })
    );

    logger.info(
      `[IdeArtifacts] Scraped ${artifacts.length}/${result?.totalCount || 0} artifacts for "${result?.conversationTitle}"`
    );

    return {
      totalCount: result?.totalCount || 0,
      artifacts,
      conversationTitle: result?.conversationTitle || null,
    };
  } catch (err: any) {
    logger.error(`[IdeArtifacts] Error scraping: ${err.message}`);
    return { totalCount: 0, artifacts: [], conversationTitle: null };
  }
}
