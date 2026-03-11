import type { ProxyContext, Conversation } from '../types';
import { logger } from '../logger';

export interface IdeConversation {
  title: string;
  active: boolean;
  index: number;
}

/**
 * Gets the list of available conversations directly from the IDE's UI.
 * This ensures we only see conversations for the current window context.
 */
export async function getIdeConversations(ctx: ProxyContext): Promise<IdeConversation[]> {
  try {
    logger.info('[Scraper] Fetching conversations strictly from IDE UI...');
    
    if (!ctx.workbenchPage) {
      logger.info('[Scraper] No active workbench page.');
      return [];
    }

    const result = await ctx.workbenchPage.evaluate(async () => {
      try {
        // 1. Get the CURRENT active conversation title from the chat panel header
        const activeHeaderEl = document.querySelector('span.font-semibold.text-ide-text-color');
        const activeTitle = activeHeaderEl && activeHeaderEl.textContent ? activeHeaderEl.textContent.trim() : null;

        // 2. Find the history button
        const historyBtn = document.querySelector('a[data-past-conversations-toggle="true"]');
        
        if (!historyBtn) {
          return { error: 'History button not found (a[data-past-conversations-toggle="true"])' };
        }
        
        let isAlreadyOpen = !!document.querySelector('.text-quickinput-foreground.opacity-50');
        
        if (!isAlreadyOpen) {
          historyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          historyBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          historyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (document.querySelector('.text-quickinput-foreground.opacity-50')) {
              isAlreadyOpen = true;
              break;
            }
          }
        }
        
        if (!isAlreadyOpen) {
          return { error: 'History dropdown did not appear after clicking' };
        }
        
        // 3. Extract the conversations
        const rowSelector = '.cursor-pointer.flex.items-center.justify-between.rounded-md.text-quickinput-foreground';
        const rowElements = Array.from(document.querySelectorAll(rowSelector));
        
        const rows = rowElements.map((row, index) => {
          const titleEl = row.querySelector('.truncate span');
          const title = titleEl ? titleEl.textContent?.trim() || '' : row.textContent?.trim() || '';
          
          let isActive = row.className.includes('bg-gray-500/10') || !!row.querySelector('svg.lucide-circle');
          if (activeTitle && title === activeTitle) {
              isActive = true;
          }
          
          return { title, active: isActive, index };
        });
        
        // 4. Close the dropdown
        historyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        historyBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        historyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        
        return { rows, activeTitle };
      } catch (e: any) {
        return { error: e.message };
      }
    });
    
    if (result?.error) {
      throw new Error(`Failed to scrape IDE conversations: ${result.error}`);
    }
    
    if (!result?.rows) {
      logger.info('[Scraper] No rows returned from conversation scraper snippet.');
      return [];
    }

    logger.info(`[Scraper] Successfully scraped ${result.rows.length} conversations. Active title: ${result.activeTitle}`);

    let foundActive = false;
    const conversations: IdeConversation[] = result.rows.map((r: any) => {
      let active = r.active;
      
      if (result.activeTitle && r.title === result.activeTitle) {
          active = true;
      }
      
      if (active) foundActive = true;
      
      return {
        title: r.title,
        active,
        index: r.index
      };
    });
    
    if (!foundActive && result.activeTitle) {
        conversations.unshift({
            title: result.activeTitle,
            active: true,
            index: -1
        });
    }

    return conversations;
  } catch (err: any) {
    logger.error(`[Scraper] Error fetching IDE conversations: ${err.message}`);
    throw err;
  }
}
