/**
 * Agent/model selector scraper and switcher.
 * Reads the current AI agent and available agents from the Antigravity IDE,
 * and can switch between them via CDP.
 *
 * DOM structure (discovered via inspector):
 * - Current agent: span.text-xs with classes including "select-none opacity-70"
 *   inside a DIV with cursor-pointer. Text e.g. "Claude Opus 4.6 (Thinking)"
 * - Agent list: visible in the DOM as span.text-xs.font-medium elements inside
 *   DIVs with class "flex items-center justify-start gap-2", each is clickable.
 * - The agent selector parent DIV has classes like:
 *   "flex min-w-0 max-w-full cursor-pointer items-center h-full gap-0.5 rounded-md py-1 pl-[0.125rem] pr-"
 */

import { logger } from '@/lib/logger';
import { sleep } from '@/lib/utils';
import type { ProxyContext } from '../types';

export interface AgentInfo {
  /** Display name of the agent, e.g. "Claude Opus 4.6 (Thinking)" */
  name: string;
  /** Whether this agent is currently selected */
  active: boolean;
}

/**
 * Read the currently selected agent/model from the IDE's agent panel DOM.
 *
 * The current agent name is in a span with classes:
 *   `min-w-0 select-none overflow-hidden text-ellipsis whitespace-nowrap text-xs opacity-70`
 * inside a DIV that is cursor-pointer (the clickable agent selector button).
 */
export async function getCurrentAgent(ctx: ProxyContext): Promise<string | null> {
  if (!ctx.workbenchPage) throw new Error('Not connected to Antigravity');

  const agent = await ctx.workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return null;

    // Strategy: Find span.text-xs.select-none with opacity-70 that is inside
    // a cursor-pointer parent — this is the current agent display
    const spans = panel.querySelectorAll('span.text-xs');
    for (const span of spans) {
      const cls = span.className || '';
      // Must have select-none and opacity-70 (the active agent label)
      if (!cls.includes('select-none') || !cls.includes('opacity-70')) continue;
      // Skip mode labels (Fast / Planning)
      const text = (span.textContent || '').trim();
      if (text === 'Fast' || text === 'Planning') continue;
      // Must be inside a cursor-pointer parent
      const parent = span.closest('[class*="cursor-pointer"]');
      if (parent) return text;
    }

    return null;
  });

  if (!agent) {
    logger.warn('[AgentSelector] Could not detect current agent');
  }

  return agent;
}

/**
 * Get the list of available agents from the agent selector dropdown.
 *
 * The agent options are rendered as span.text-xs.font-medium inside
 * DIVs with class "flex items-center justify-start gap-2".
 * These are inside a dropdown container that opens when the agent
 * selector is clicked.
 */
export async function getAvailableAgents(ctx: ProxyContext): Promise<AgentInfo[]> {
  if (!ctx.workbenchPage) throw new Error('Not connected to Antigravity');

  // Step 1: Click the agent selector to open the dropdown
  const clicked = await ctx.workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return false;

    // Find the agent selector button (div with cursor-pointer containing our agent name span)
    const spans = panel.querySelectorAll('span.text-xs');
    for (const span of spans) {
      const cls = span.className || '';
      if (!cls.includes('select-none') || !cls.includes('opacity-70')) continue;
      const text = (span.textContent || '').trim();
      if (text === 'Fast' || text === 'Planning') continue;
      const parent = span.closest('[class*="cursor-pointer"]');
      if (parent) {
        (parent as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    logger.warn('[AgentSelector] Could not find agent selector button to click');
    return [];
  }

  await sleep(400);

  // Step 2: Read the options from the dropdown/dialog
  const agents = await ctx.workbenchPage.evaluate(() => {
    const results: { name: string; active: boolean }[] = [];

    // Look for a dialog that appeared
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
      const content = (dialog.textContent || '').trim();
      // Skip unrelated dialogs
      if (!content || content.length < 10) continue;

      // Find agent option rows — spans with text-xs font-medium inside flex containers
      const optionSpans = dialog.querySelectorAll('span.text-xs.font-medium');
      for (const span of optionSpans) {
        const name = (span.textContent || '').trim();
        if (!name) continue;

        // Check if this option is active (has a check mark or highlight)
        const row = span.closest('[class*="cursor-pointer"], [class*="hover"]');
        const hasCheck = row?.querySelector('svg.lucide-check, svg[class*="check"]') !== null;
        const isHighlighted = row && (row.className || '').includes('bg-');

        results.push({ name, active: hasCheck || !!isHighlighted });
      }
      if (results.length > 0) break;
    }

    // Fallback: scan all visible font-medium text-xs spans for model names
    if (results.length === 0) {
      const modelPatterns = [
        /claude/i, /gemini/i, /gpt/i, /sonnet/i, /opus/i,
        /haiku/i, /flash/i, /deepseek/i, /llama/i, /mistral/i,
      ];
      const allFontMedium = document.querySelectorAll('span.text-xs.font-medium');
      for (const span of allFontMedium) {
        const name = (span.textContent || '').trim();
        if (modelPatterns.some(p => p.test(name))) {
          results.push({ name, active: false });
        }
      }
    }

    return results;
  });

  // Close the dialog if it opened
  await ctx.workbenchPage.keyboard.press('Escape');
  await sleep(200);

  // Mark the current agent as active
  const currentAgent = await getCurrentAgent(ctx);
  if (currentAgent) {
    for (const a of agents) {
      a.active = a.name === currentAgent;
    }
  }

  return agents;
}

/**
 * Switch to a different agent/model by clicking it in the agent selector.
 */
export async function setAgent(ctx: ProxyContext, targetAgent: string): Promise<boolean> {
  if (!ctx.workbenchPage) throw new Error('Not connected to Antigravity');

  logger.info(`[AgentSelector] Switching to agent: "${targetAgent}"...`);

  // Step 1: Click the agent selector button to open dialog
  const clicked = await ctx.workbenchPage.evaluate(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return false;

    const spans = panel.querySelectorAll('span.text-xs');
    for (const span of spans) {
      const cls = span.className || '';
      if (!cls.includes('select-none') || !cls.includes('opacity-70')) continue;
      const text = (span.textContent || '').trim();
      if (text === 'Fast' || text === 'Planning') continue;
      const parent = span.closest('[class*="cursor-pointer"]');
      if (parent) {
        (parent as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!clicked) {
    throw new Error('Could not find agent selector button');
  }

  await sleep(400);

  // Step 2: Find and click the target agent in the dialog
  const selected = await ctx.workbenchPage.evaluate((target: string) => {
    const targetLower = target.toLowerCase();

    // Search in dialogs first
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
      const optionSpans = dialog.querySelectorAll('span.text-xs.font-medium');
      for (const span of optionSpans) {
        const name = (span.textContent || '').trim();
        if (name.toLowerCase() === targetLower || name.toLowerCase().includes(targetLower)) {
          // Click the parent row element
          const clickTarget = span.closest('[class*="cursor-pointer"]') ||
                              span.closest('[class*="hover"]') ||
                              span.parentElement;
          if (clickTarget) {
            (clickTarget as HTMLElement).click();
            return true;
          }
        }
      }
    }

    // Fallback: scan full DOM for font-medium spans matching the target
    const allFontMedium = document.querySelectorAll('span.text-xs.font-medium');
    for (const span of allFontMedium) {
      const name = (span.textContent || '').trim();
      if (name.toLowerCase() === targetLower || name.toLowerCase().includes(targetLower)) {
        const clickTarget = span.closest('[class*="cursor-pointer"]') ||
                            span.closest('[class*="hover"]') ||
                            span.parentElement;
        if (clickTarget) {
          (clickTarget as HTMLElement).click();
          return true;
        }
      }
    }

    return false;
  }, targetAgent);

  if (!selected) {
    await ctx.workbenchPage.keyboard.press('Escape');
    await sleep(200);
    throw new Error(`Could not find agent "${targetAgent}" in the selector`);
  }

  await sleep(300);

  // Verify the switch
  const newAgent = await getCurrentAgent(ctx);
  logger.info(`[AgentSelector] Agent is now: "${newAgent}"`);

  return true;
}
