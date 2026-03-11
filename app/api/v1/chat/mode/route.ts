import { NextRequest, NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { getAgentMode, setAgentMode } from '@/lib/scraper/agent-mode';
import type { AgentMode } from '@/lib/scraper/agent-mode';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/chat/mode — Read the current conversation mode.
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
    const mode = await getAgentMode(ctx);
    return NextResponse.json({ mode });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/chat/mode — Switch the conversation mode.
 * Body: { mode: 'planning' | 'fast' }
 */
export async function POST(req: NextRequest) {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json(
      { error: 'Not connected to Antigravity' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const targetMode = body.mode as AgentMode;

    if (targetMode !== 'planning' && targetMode !== 'fast') {
      return NextResponse.json(
        { error: 'Invalid mode. Must be "planning" or "fast".' },
        { status: 400 }
      );
    }

    await setAgentMode(ctx, targetMode);
    const currentMode = await getAgentMode(ctx);
    return NextResponse.json({ success: true, mode: currentMode });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
