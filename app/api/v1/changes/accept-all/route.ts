import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { clickAcceptAllChanges } from '@/lib/actions/changes-actions';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/changes/accept-all
 *
 * Clicks the "Accept all" button in the IDE's Changes Overview panel,
 * accepting all file changes made during the current conversation.
 */
export async function POST() {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json({ error: 'Not connected' }, { status: 503 });
  }

  try {
    const result = await clickAcceptAllChanges(ctx);
    ctx.lastActionTimestamp = Date.now();
    return NextResponse.json(result, { status: result.success ? 200 : 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
