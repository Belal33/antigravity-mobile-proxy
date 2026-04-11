import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json({ error: 'Not connected' }, { status: 503 });
  }

  try {
    // Use CDP's DOM.querySelector + Input.dispatchMouseEvent directly
    // to bypass any JavaScript event issues
    const page = ctx.workbenchPage;
    
    // Get button position
    const btnPos = await page.evaluate(() => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return null;
      
      // Get the REAL button - not code blocks in conversation
      const allBtns = panel.querySelectorAll('[data-tooltip-id="tooltip-artifacts"]');
      // Find the one that's actually a UI button (has cursor-pointer class)
      let btn: HTMLElement | null = null;
      for (const el of allBtns) {
        const classes = (el as HTMLElement).className || '';
        if (classes.includes('cursor-pointer') && !el.closest('.leading-relaxed') && 
            !el.closest('code') && !el.closest('pre')) {
          btn = el as HTMLElement;
          break;
        }
      }
      if (!btn) return null;
      
      const rect = btn.getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        w: rect.width,
        h: rect.height,
        tag: btn.tagName,
        classes: btn.className?.substring(0, 80),
        totalBtns: allBtns.length,
      };
    });

    if (!btnPos) return NextResponse.json({ error: 'Button not found' });

    // Capture gap text BEFORE click
    const beforeText = await page.evaluate(() => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      const gap = panel?.querySelector('.flex.grow.flex-col.justify-start.gap-8');
      return (gap?.textContent || '').substring(0, 300);
    });

    // Use Puppeteer's page.mouse.click for a true browser-level click
    await page.mouse.click(btnPos.x, btnPos.y);
    
    // Wait for section to appear
    await new Promise(r => setTimeout(r, 2000));

    // Check gap text AFTER click
    const afterHTML = await page.evaluate(() => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      const gap = panel?.querySelector('.flex.grow.flex-col.justify-start.gap-8');
      
      return panel ? panel.innerHTML : "No panel";
    });

    const hasArtifacts = afterHTML.includes('Artifacts (');
    const hasFiles = afterHTML.includes('Files for Conversation');

    // Close by clicking again
    await page.mouse.click(btnPos.x, btnPos.y);
    await new Promise(r => setTimeout(r, 300));

    return NextResponse.json({
      btnPos,
      beforeText: beforeText.substring(0, 200),
      hasArtifacts,
      hasFiles,
      afterHTML: afterHTML.substring(0, 500000), // Send full HTML
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.substring(0, 200) }, { status: 500 });
  }
}
