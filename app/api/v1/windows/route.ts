import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { discoverWorkbenches, selectWindow } from '@/lib/cdp/connection';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/windows — list all available Antigravity workbench windows.
 */
export async function GET() {
  await ensureCdpConnection();

  try {
    const workbenches = await discoverWorkbenches(ctx);
    return NextResponse.json({
      windows: workbenches.map((w, idx) => ({
        index: idx,
        title: w.title,
        url: w.url,
        active: idx === ctx.activeWindowIdx,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
