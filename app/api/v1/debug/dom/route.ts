import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/debug/dom — dump raw HTML of the agent panel for debugging.
 */
export async function GET() {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json(
      { error: 'Not connected to Antigravity' },
      { status: 503 }
    );
  }

  try {
    const html = await ctx.workbenchPage.evaluate(() => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      return panel ? (panel as HTMLElement).innerHTML : 'Panel not found';
    });
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
