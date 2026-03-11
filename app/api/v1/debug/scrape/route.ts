import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { getFullAgentState } from '@/lib/scraper/agent-state';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/debug/scrape — Returns both the raw last-turn HTML
 * and the full parsed agent state for debugging.
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
    // 1. Get parsed state via the scraper
    const parsedState = await getFullAgentState(ctx);

    // 2. Get raw HTML of the last turn from the panel
    const rawHTML = await ctx.workbenchPage.evaluate(() => {
      const panel = document.querySelector('.antigravity-agent-side-panel');
      if (!panel) return '<p>Panel not found</p>';

      const conversation =
        panel.querySelector('#conversation') ||
        document.querySelector('#conversation');
      const scrollArea = conversation?.querySelector('.overflow-y-auto');
      const msgList = scrollArea?.querySelector('.mx-auto');
      const allTurns = msgList ? Array.from(msgList.children) : [];
      const lastTurn = allTurns.length > 0 ? allTurns[allTurns.length - 1] : null;

      if (!lastTurn) return '<p>No turns found</p>';
      return (lastTurn as HTMLElement).innerHTML;
    });

    return NextResponse.json({
      raw: rawHTML,
      parsed: parsedState,
      meta: {
        timestamp: new Date().toISOString(),
        activeWindowIdx: ctx.activeWindowIdx,
        turnCount: parsedState.turnCount,
        toolCallCount: parsedState.toolCalls.length,
        responseCount: parsedState.responses.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
