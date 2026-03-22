import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { clickRejectAllChanges } from '@/lib/actions/changes-actions';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/changes/reject-all
 *
 * Clicks the "Reject all" button in the IDE's Changes Overview panel,
 * rejecting/reverting all file changes made during the current conversation.
 */
export async function POST() {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json({ error: 'Not connected' }, { status: 503 });
  }

  try {
    const result = await clickRejectAllChanges(ctx);
    ctx.lastActionTimestamp = Date.now();
    return NextResponse.json(result, { status: result.success ? 200 : 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
