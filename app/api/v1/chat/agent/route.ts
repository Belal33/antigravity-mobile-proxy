import { NextRequest, NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { getCurrentAgent, getAvailableAgents, setAgent } from '@/lib/scraper/agent-selector';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/chat/agent — Read the current agent and available agents.
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
    const currentAgent = await getCurrentAgent(ctx);
    // Only fetch the full list if specifically requested (it opens a dialog)
    return NextResponse.json({ agent: currentAgent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/chat/agent — Switch to a different agent or list available agents.
 * Body: { action: 'switch', agent: 'Claude Sonnet 4' } or { action: 'list' }
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
    const action = body.action || 'switch';

    if (action === 'list') {
      const agents = await getAvailableAgents(ctx);
      const currentAgent = await getCurrentAgent(ctx);
      return NextResponse.json({ agents, currentAgent });
    }

    if (action === 'switch') {
      const targetAgent = body.agent;
      if (!targetAgent || typeof targetAgent !== 'string') {
        return NextResponse.json(
          { error: 'Missing "agent" field. Provide the agent name to switch to.' },
          { status: 400 }
        );
      }

      await setAgent(ctx, targetAgent);
      const newAgent = await getCurrentAgent(ctx);
      return NextResponse.json({ success: true, agent: newAgent });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "switch" or "list".' },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
