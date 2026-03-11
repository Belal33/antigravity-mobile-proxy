/**
 * Switch the active conversation in the IDE using CDP.
 */

import { sleep } from '../utils';
import { logger } from '@/lib/logger';
import type { ProxyContext } from '../types';

export async function switchIdeConversation(
  ctx: ProxyContext,
  conversationTitle: string
): Promise<boolean> {
  if (!ctx.workbenchPage || !conversationTitle) return false;

  try {
    const success = await ctx.workbenchPage.evaluate(
      async (targetTitle: string) => {
        const historyBtn = document.querySelector('a[data-past-conversations-toggle="true"]');
        if (!historyBtn) return false;

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

        if (!isAlreadyOpen) return false;

        const rowSelector = '.cursor-pointer.flex.items-center.justify-between.rounded-md.text-quickinput-foreground';
        const rowElements = Array.from(document.querySelectorAll(rowSelector));
        
        let matchedRow: Element | null = null;
        for (const row of rowElements) {
          const titleEl = row.querySelector('.truncate span');
          const title = titleEl ? titleEl.textContent?.trim() : row.textContent?.trim();
          
          if (title === targetTitle) {
            matchedRow = row;
            break;
          }
        }

        if (matchedRow) {
          matchedRow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, view: window }));
          matchedRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          matchedRow.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, view: window }));
          matchedRow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          matchedRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          
          // The modal usually auto-closes on click.
          // If it doesn't, we can simulate an escape or click body.
          setTimeout(() => {
             const stillOpen = !!document.querySelector('.text-quickinput-foreground.opacity-50');
             if (stillOpen && historyBtn) {
               historyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
               historyBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
               historyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
             }
          }, 300);
          
          return true;
        }

        // If not found, close modal
        historyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        historyBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        historyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

        return false;
      },
      conversationTitle
    );

    if (success) {
      await sleep(1000); // Give it a second to load the new conversation
    }
    return success;
  } catch (e: any) {
    logger.error('[Action] Error switching IDE conversation:', e);
    return false;
  }
}
