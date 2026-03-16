import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { getIdeChanges } from '@/lib/scraper/ide-changes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/changes/active — list file changes for the active conversation.
 *
 * Scrapes the IDE's "Changes Overview" section to get the list of files
 * modified/created/deleted in the current conversation with diff stats.
 */
export async function GET() {
  try {
    await ensureCdpConnection();

    if (!ctx.workbenchPage) {
      return NextResponse.json({ changes: [], totalCount: 0, error: 'No CDP connection' });
    }

    const result = await getIdeChanges(ctx);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
