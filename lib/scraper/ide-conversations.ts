import type { ProxyContext } from '../types';
import { logger } from '../logger';

export interface IdeConversation {
  title: string;
  active: boolean;
  index: number;
}

/**
 * Gets the list of available conversations directly from the IDE's UI.
 *
 * The ACTIVE conversation title is read from the chat panel header — the `div`
 * that sits as the first sibling of the history-button container, inside:
 *   <div class="flex items-center justify-between gap-2 px-2 py-[5.5px] ...">
 *     <div class="flex min-w-0 items-center ...">CURRENT TITLE</div>
 *     <div class="flex items-center gap-2 ...">  ← contains the history button
 *
 * We then match this title against the rows scraped from the history dropdown.
 * If no row matches (e.g. the conversation is still generating its title and
 * the text doesn't appear in the list yet), we surface it as a synthetic entry
 * so the "Current" section always reflects what is truly open.
 */
export async function getIdeConversations(ctx: ProxyContext): Promise<IdeConversation[]> {
  try {
    logger.info('[Scraper] Fetching conversations from IDE UI...');

    if (!ctx.workbenchPage) {
      logger.info('[Scraper] No active workbench page.');
      return [];
    }

    const result = await ctx.workbenchPage.evaluate(async () => {
      try {
        // ── 1. Read the current conversation title from the chat panel header ──
        // The history button lives inside:
        //   grandParent > div.flex.min-w-0 (title) + div.flex.items-center.gap-2 (buttons)
        const historyBtn = document.querySelector('a[data-past-conversations-toggle="true"]');
        if (!historyBtn) return { error: 'History button not found' };

        // Navigate: historyBtn → parent (button container) → grandParent (header row)
        const headerRow = historyBtn.parentElement?.parentElement;
        const activeTitleEl = headerRow?.querySelector('div.flex.min-w-0');
        const activeTitle = activeTitleEl?.textContent?.trim() || null;

        // ── 2. Open the history dropdown ──
        let isOpen = !!document.querySelector('.text-quickinput-foreground.opacity-50');
        if (!isOpen) {
          ['mousedown', 'mouseup', 'click'].forEach(evt =>
            historyBtn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
          );
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (document.querySelector('.text-quickinput-foreground.opacity-50')) { isOpen = true; break; }
          }
        }
        if (!isOpen) return { error: 'History dropdown did not appear', activeTitle };

        // ── 3. Scrape all rows ──
        const rowSelector = '.cursor-pointer.flex.items-center.justify-between.rounded-md.text-quickinput-foreground';
        const rows = Array.from(document.querySelectorAll(rowSelector)).map((row, index) => {
          const titleEl = row.querySelector('.truncate span') || row.querySelector('.truncate');
          const title = titleEl ? titleEl.textContent?.trim() || '' : row.textContent?.trim() || '';
          return { title, index };
        });

        // ── 4. Close the dropdown ──
        ['mousedown', 'mouseup', 'click'].forEach(evt =>
          historyBtn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
        );

        return { rows, activeTitle };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    if (result?.error && !result?.activeTitle) {
      throw new Error(`Failed to scrape IDE conversations: ${result.error}`);
    }

    const rows: Array<{ title: string; index: number }> = result?.rows || [];
    const activeTitle: string | null = result?.activeTitle || null;

    logger.info(
      `[Scraper] Scraped ${rows.length} rows. ` +
      `Active title from header: "${activeTitle ?? 'unknown'}"`
    );

    // ── 5. Mark the active row by matching the header title ──
    let foundActive = false;
    const conversations: IdeConversation[] = rows.map((r) => {
      // Exact match first, then substring match as fallback
      const isActive = activeTitle
        ? r.title === activeTitle || r.title.includes(activeTitle) || activeTitle.includes(r.title)
        : false;
      if (isActive) foundActive = true;
      return { title: r.title, active: isActive, index: r.index };
    });

    // ── 6. If the active conversation isn't in the history list, prepend it ──
    // This happens when the title is still being generated ("Generating Conversation Title")
    // and the conversation hasn't been saved to the history dropdown yet.
    if (!foundActive && activeTitle) {
      logger.warn(`[Scraper] Active title "${activeTitle}" not found in history rows — prepending as current.`);
      conversations.unshift({ title: activeTitle, active: true, index: -1 });
    }

    // ── 7. Fallback: if we couldn't read any active title, use the first row ──
    if (!foundActive && !activeTitle && conversations.length > 0) {
      logger.warn('[Scraper] Could not read active title from header — using first row as fallback.');
      conversations[0] = { ...conversations[0], active: true };
    }

    return conversations;
  } catch (err: any) {
    logger.error(`[Scraper] Error fetching IDE conversations: ${err.message}`);
    throw err;
  }
}
