/**
 * Chat history scraper.
 * Scrolls the Antigravity conversation view to de-virtualize all content,
 * then walks the DOM to extract user/agent messages in order.
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

    // Step 1: Scroll to top to force older content to render
    scrollArea.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 300));

    // Step 2: Incrementally scroll down to de-virtualize all content
    const scrollHeight = scrollArea.scrollHeight;
    const viewportHeight = scrollArea.clientHeight;
    const scrollStep = viewportHeight * 0.8;
    let pos = 0;
    while (pos < scrollHeight) {
      scrollArea.scrollTop = pos;
      await new Promise((r) => setTimeout(r, 100));
      pos += scrollStep;
    }
    scrollArea.scrollTop = scrollArea.scrollHeight;
    await new Promise((r) => setTimeout(r, 200));

    // Step 3: Walk the DOM to find messages in document order
    const turns: { role: 'user' | 'agent'; content: string }[] = [];
    const seen = new Set<string>();

    const msgList =
      (scrollArea as Element).querySelector('.mx-auto') || scrollArea;

    const candidates: {
      el: Element;
      role: 'user' | 'agent';
      content: string;
    }[] = [];

    // Find user messages
    const allWhitespace = msgList.querySelectorAll('.whitespace-pre-wrap');
    for (const el of allWhitespace) {
      const text = el.textContent?.trim();
      if (!text) continue;

      let isInsideAgentResponse = false;
      let parent = el.parentElement;
      while (parent && parent !== msgList) {
        const cls = parent.getAttribute('class') || '';
        if (
          cls.includes('leading-relaxed') &&
          cls.includes('select-text')
        ) {
          isInsideAgentResponse = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (isInsideAgentResponse) continue;

      if (el.closest('[data-lexical-editor]')) continue;
      if (el.closest('#antigravity\\.agentSidePanelInputBox')) continue;

      const key = 'user:' + text.substring(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({ el, role: 'user', content: text });
    }

    // Find agent response blocks
    const allResponses = msgList.querySelectorAll(
      '.leading-relaxed.select-text'
    );
    for (const el of allResponses) {
      let hidden = false;
      let ancestor = el.parentElement;
      let depth = 0;
      while (ancestor && ancestor !== msgList && depth < 15) {
        const cls = ancestor.getAttribute('class') || '';
        if (cls.includes('max-h-0') || cls.includes('hidden')) {
          hidden = true;
          break;
        }
        ancestor = ancestor.parentElement;
        depth++;
      }
      if (hidden) continue;

      const clone = el.cloneNode(true) as Element;
      clone.querySelectorAll('style, script').forEach((n) => n.remove());
      const html = (clone as HTMLElement).innerHTML?.trim();
      if (!html) continue;

      const key = 'agent:' + el.textContent?.trim().substring(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({ el, role: 'agent', content: html });
    }

    // Sort by document position
    candidates.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

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
