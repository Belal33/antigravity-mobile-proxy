import { NextRequest, NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { clickActionButton } from '@/lib/actions/hitl';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json({ error: 'Not connected' }, { status: 503 });
  }

  const body = await request.json();
  const { toolId, buttonText } = body;
  if (!buttonText) {
    return NextResponse.json(
      { error: 'buttonText is required' },
      { status: 400 }
    );
  }

  try {
    const result = await clickActionButton(ctx, toolId || null, buttonText);
    ctx.lastActionTimestamp = Date.now();
    return NextResponse.json(result, { status: result.success ? 200 : 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
