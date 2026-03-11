import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { getFullAgentState } from '@/lib/scraper/agent-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json(
      { error: 'Not connected to Antigravity' },
      { status: 503 }
    );
  }

  try {
    const state = await getFullAgentState(ctx);
    return NextResponse.json(state);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
