/**
 * Agent conversation mode scraper and switcher.
 * Reads and sets the Plan/Fast mode in the Antigravity IDE via CDP.
 */

import { logger } from '@/lib/logger';
import { sleep } from '@/lib/utils';
import type { ProxyContext } from '../types';

export type AgentMode = 'planning' | 'fast';

/**
 * Read the current conversation mode from the IDE's agent panel DOM.
 * Looks for the mode button's span text near the chat input.
 */
export async function getAgentMode(ctx: ProxyContext): Promise<AgentMode> {
  if (!ctx.workbenchPage) throw new Error('Not connected to Antigravity');

  const mode = await ctx.workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return null;

    // The mode button contains a <span class="text-xs select-none"> with text "Planning" or "Fast"
    const spans = panel.querySelectorAll('span.text-xs.select-none');
    for (const span of spans) {
      const text = (span.textContent || '').trim().toLowerCase();
      if (text === 'planning' || text === 'fast') {
        return text;
      }
    }
    return null;
  });

  if (!mode) {
    logger.warn('[Mode] Could not detect current mode, defaulting to "planning"');
    return 'planning';
  }

  return mode as AgentMode;
}

/**
 * Switch the conversation mode in the IDE.
 * Clicks the mode button to open the dropdown, then selects the target mode.
 */
export async function setAgentMode(ctx: ProxyContext, targetMode: AgentMode): Promise<void> {
  if (!ctx.workbenchPage) throw new Error('Not connected to Antigravity');

  const currentMode = await getAgentMode(ctx);
  if (currentMode === targetMode) {
    logger.info(`[Mode] Already in "${targetMode}" mode, skipping.`);
    return;
  }

  logger.info(`[Mode] Switching from "${currentMode}" to "${targetMode}"...`);

  // Step 1: Click the mode button to open the dialog
  const clicked = await ctx.workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return false;

    const spans = panel.querySelectorAll('span.text-xs.select-none');
    for (const span of spans) {
      const text = (span.textContent || '').trim().toLowerCase();
      if (text === 'planning' || text === 'fast') {
        const btn = span.closest('button');
        if (btn) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  });

  if (!clicked) {
    throw new Error('Could not find mode button to click');
  }

  await sleep(400);

  // Step 2: Find the dialog and click the target option
  const targetLabel = targetMode === 'planning' ? 'Planning' : 'Fast';

  const selected = await ctx.workbenchPage.evaluate((label: string) => {
    // Find the "Conversation mode" dialog
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
      const text = (dialog.textContent || '').trim();
      if (!text.includes('Conversation mode')) continue;

      // Find the option with matching text
      const options = dialog.querySelectorAll('.font-medium');
      for (const opt of options) {
        if ((opt.textContent || '').trim() === label) {
          // Click the option's parent (the clickable row)
          const clickTarget = opt.closest('[class*="cursor-pointer"]');
          if (clickTarget) {
            (clickTarget as HTMLElement).click();
            return true;
          }
          // Fallback: click the option itself
          (opt as HTMLElement).click();
          return true;
        }
      }
    }
    return false;
  }, targetLabel);

  if (!selected) {
    // Close dialog by pressing Escape
    await ctx.workbenchPage.keyboard.press('Escape');
    throw new Error(`Could not find "${targetLabel}" option in mode dialog`);
  }

  await sleep(300);

  // Verify the switch
  const newMode = await getAgentMode(ctx);
  logger.info(`[Mode] Mode is now "${newMode}".`);
}
