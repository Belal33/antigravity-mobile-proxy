/**
 * Send a chat message by typing into the Antigravity input and pressing Enter.
 */

import { SELECTORS } from '../cdp/selectors';
import { sleep } from '../utils';
import { logger } from '@/lib/logger';
import type { ProxyContext } from '../types';

export async function sendMessage(ctx: ProxyContext, text: string) {
  if (!ctx.workbenchPage) throw new Error('Not connected to Antigravity');

  logger.info(`[Chat] Sending message (${text.length} chars)...`);

  await ctx.workbenchPage.click(SELECTORS.chatInput);
  await sleep(200);

  await ctx.workbenchPage.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (el) {
      el.textContent = '';
      (el as HTMLElement).focus();
    }
  }, SELECTORS.chatInput);

  await ctx.workbenchPage.keyboard.type(text);
  await sleep(300);

  await ctx.workbenchPage.keyboard.press('Enter');
  logger.info(`[Chat] Sent.`);
}
