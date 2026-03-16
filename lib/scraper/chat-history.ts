/**
 * Chat history scraper.
 * Scrolls the Antigravity conversation view viewport-by-viewport,
 * waiting for content to load at each position, then extracts
 * user/agent messages in document order.
 *
 * Key design decisions:
 * - Viewport-pinned extraction: collect content at each scroll position
 *   rather than scrolling everything first, because Antigravity re-virtualizes
 *   content that scrolls out of view.
 * - Wait for skeleton resolution: skeleton blocks (.bg-gray-500/10) appear
 *   temporarily while content loads; we wait for them to clear.
 * - Clean deduplication: dedup keys are built from cleaned text (without
 *   injected <style> content) to avoid false collisions.
 * - User message filtering: excludes CODE tags, tool containers, and
 *   notify blocks that incorrectly match .whitespace-pre-wrap.
 * - Agent response categorization: distinguishes between thinking summaries,
 *   tool descriptions, notify messages, and final responses.
 */

import type { ProxyContext, ChatHistory } from '../types';

export async function getChatHistory(ctx: ProxyContext): Promise<ChatHistory> {
  if (!ctx.workbenchPage) {
    return { isRunning: false, turnCount: 0, turns: [] };
  }

  return await ctx.workbenchPage.evaluate(async () => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    if (!panel) return { isRunning: false, turnCount: 0, turns: [] };

    const conversation =
      panel.querySelector('#conversation') ||
      document.querySelector('#conversation');
    const scrollArea = conversation?.querySelector('.overflow-y-auto');
    if (!scrollArea)
      return { isRunning: false, turnCount: 0, turns: [] };

    const msgList =
      (scrollArea as Element).querySelector('.mx-auto') || scrollArea;

    // ── Helper: wait for skeleton blocks in current viewport to resolve ──
    async function waitForLoad(maxWait = 3000) {
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        const skeletons = Array.from(msgList.querySelectorAll(
          '.rounded-lg.bg-gray-500\\/10'
        ));
        let visibleSkeletons = 0;
        const panelRect = scrollArea!.getBoundingClientRect();
        for (const sk of skeletons) {
          const rect = sk.getBoundingClientRect();
          const relTop = rect.top - panelRect.top;
          const relBottom = rect.bottom - panelRect.top;
          if (
            relBottom > -50 &&
            relTop < scrollArea!.clientHeight + 50
          ) {
            visibleSkeletons++;
          }
        }
        if (visibleSkeletons === 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // ── Helper: extract clean text from an element (strips <style>) ──
    function getCleanText(el: Element): string {
      const clone = el.cloneNode(true) as Element;
      clone.querySelectorAll('style, script').forEach((n) => n.remove());
      return (clone as HTMLElement).textContent?.trim() || '';
    }

    // ── Helper: extract clean HTML from an element ──
    function getCleanHTML(el: Element): string {
      const clone = el.cloneNode(true) as Element;
      clone.querySelectorAll('style, script').forEach((n) => n.remove());
      // Remove Antigravity interactive UI chrome
      clone
        .querySelectorAll(
          'svg.cursor-pointer, [class*="cursor-pointer"][class*="opacity-70"], button[class*="opacity-70"]'
        )
        .forEach((n) => n.remove());
      return (clone as HTMLElement).innerHTML?.trim() || '';
    }

    // ── Helper: check if element is visually hidden ──
    function isHidden(el: Element, root: Element): boolean {
      let ancestor = el.parentElement;
      let depth = 0;
      while (ancestor && ancestor !== root && depth < 15) {
        const cls = ancestor.getAttribute('class') || '';
        if (cls.includes('max-h-0') || cls.includes('hidden')) {
          return true;
        }
        // Check inline styles too
        const style = (ancestor as HTMLElement).style;
        if (
          style &&
          (style.display === 'none' || style.maxHeight === '0px')
        ) {
          return true;
        }
        // Check if the element has zero height (collapsed)
        if ((ancestor as HTMLElement).offsetHeight === 0) {
          return true;
        }
        ancestor = ancestor.parentElement;
        depth++;
      }
      return false;
    }

    // ── Viewport-by-viewport extraction ──
    // Items are tagged with their absolute Y position at collection time
    // so we can sort chronologically even after elements get re-virtualized.
    const seen = new Set<string>();
    const candidates: {
      absY: number;   // scrollTop + element offset — for chronological sorting
      role: 'user' | 'agent';
      content: string;
      contentType?: string;
    }[] = [];

    function collectAtCurrentPosition() {
      const panelRect = scrollArea!.getBoundingClientRect();
      const currentScroll = scrollArea!.scrollTop;

      // ── Collect user messages ──
      for (const el of Array.from(msgList.querySelectorAll('.whitespace-pre-wrap'))) {
        const text = el.textContent?.trim();
        if (!text || text.length < 2) continue;

        // Skip if inside agent response block
        if (el.closest('.leading-relaxed.select-text')) continue;
        // Skip editor / input box
        if (el.closest('[data-lexical-editor]')) continue;
        if (
          el.closest('#antigravity\\.agentSidePanelInputBox')
        )
          continue;
        // Skip CODE tags (inline code references like `file.ts`)
        if (el.tagName === 'CODE') continue;
        // Skip elements inside tool containers
        if (
          el.closest(
            '.flex.flex-col.gap-2.border.rounded-lg'
          )
        )
          continue;
        // Skip elements inside notify containers (these are agent content)
        if (el.closest('.notify-user-container')) continue;

        // Check if in current viewport
        const rect = el.getBoundingClientRect();
        const relTop = rect.top - panelRect.top;
        if (
          relTop < -100 ||
          relTop > scrollArea!.clientHeight + 100
        )
          continue;

        const key = 'user:' + text.substring(0, 300);
        if (seen.has(key)) continue;
        seen.add(key);

        // Absolute Y position = scroll offset + element's position relative to scroll container
        const absY = currentScroll + relTop;
        candidates.push({ absY, role: 'user', content: text });
      }

      // ── Collect agent response blocks ──
      for (const el of Array.from(msgList.querySelectorAll(
        '.leading-relaxed.select-text'
      ))) {
        if (isHidden(el, msgList)) continue;

        // Check if in current viewport
        const rect = el.getBoundingClientRect();
        const relTop = rect.top - panelRect.top;
        if (
          relTop < -100 ||
          relTop > scrollArea!.clientHeight + 100
        )
          continue;

        // Get clean HTML (strips <style>, <script>, UI chrome)
        const html = getCleanHTML(el);
        if (!html) continue;

        // Build dedup key from CLEAN text (not raw textContent which includes <style>)
        const cleanText = getCleanText(el);
        if (!cleanText) continue;

        const key = 'agent:' + cleanText.substring(0, 300);
        if (seen.has(key)) continue;
        seen.add(key);

        // Categorize the response
        const inNotify = !!el.closest('.notify-user-container');
        const parentClass =
          el.parentElement?.getAttribute('class') || '';
        const isThinkingSummary =
          parentClass.includes('font-medium') &&
          parentClass.includes('pb-0');

        // Skip thinking summaries (these are short descriptions of agent thoughts,
        // not the actual response to the user)
        if (isThinkingSummary) continue;

        const contentType = inNotify ? 'notify' : 'response';
        const absY = currentScroll + relTop;

        candidates.push({
          absY,
          role: 'agent',
          content: html,
          contentType,
        });
      }
    }

    // ── Scroll through entire conversation, collecting at each stop ──
    const overallStart = Date.now();
    const OVERALL_TIMEOUT = 30000; // 30s max for the entire scroll

    scrollArea.scrollTop = 0;
    await waitForLoad(2000);
    await new Promise((r) => setTimeout(r, 200));
    collectAtCurrentPosition();

    const step = scrollArea.clientHeight * 0.8; // 80% viewport step
    let pos = step;
    let scrollSteps = 0;
    const maxScrollSteps = 200; // Safety limit

    while (pos < scrollArea.scrollHeight + scrollArea.clientHeight) {
      if (Date.now() - overallStart > OVERALL_TIMEOUT) break;
      scrollArea.scrollTop = pos;
      await waitForLoad(1500);
      await new Promise((r) => setTimeout(r, 50));
      collectAtCurrentPosition();
      pos += step;
      scrollSteps++;
      if (scrollSteps > maxScrollSteps) break;
    }

    // Final collection at bottom
    scrollArea.scrollTop = scrollArea.scrollHeight;
    await waitForLoad(1500);
    await new Promise((r) => setTimeout(r, 200));
    collectAtCurrentPosition();

    // ── Sort by absolute Y position (chronological order) ──
    candidates.sort((a, b) => a.absY - b.absY);

    // ── Build final turn list ──
    const turns: { role: 'user' | 'agent'; content: string }[] = [];
    for (const c of candidates) {
      turns.push({ role: c.role, content: c.content });
    }

    // Scroll back to bottom
    scrollArea.scrollTop = scrollArea.scrollHeight;

    return {
      isRunning: false,
      turnCount: turns.length,
      turns,
    };
  });
}
