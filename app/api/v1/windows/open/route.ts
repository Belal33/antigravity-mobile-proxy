import { NextRequest, NextResponse } from 'next/server';
import { openNewWindow } from '@/lib/cdp/process-manager';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { discoverWorkbenches } from '@/lib/cdp/connection';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/windows/open — Open a new Antigravity window.
 * 
 * Body:
 *   { "projectDir": "/path/to/project" }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { projectDir } = body;

  if (!projectDir || typeof projectDir !== 'string' || projectDir.trim() === '') {
    return NextResponse.json(
      { success: false, message: 'projectDir is required and must be a non-empty string.' },
      { status: 400 },
    );
  }

  try {
    const result = await openNewWindow(projectDir.trim());

    // After opening, re-discover workbenches so the proxy knows about the new window
    if (result.success) {
      try {
        // Try to reconnect/rediscover
        await ensureCdpConnection();
        await discoverWorkbenches(ctx);
      } catch {
        // Non-fatal — the window list will refresh on next poll
      }
    }

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e.message },
      { status: 500 },
    );
  }
}
