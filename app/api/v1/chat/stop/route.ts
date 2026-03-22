import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { stopAgent } from '@/lib/actions/stop-agent';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/chat/stop
 * Clicks the IDE's stop/cancel button to halt the running agent.
 */
export async function POST() {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json({ error: 'Not connected' }, { status: 503 });
  }

  try {
    const result = await stopAgent(ctx);
    ctx.lastActionTimestamp = Date.now();
    return NextResponse.json(result, { status: result.success ? 200 : 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
