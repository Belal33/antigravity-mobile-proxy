import { NextRequest, NextResponse } from 'next/server';
import { startCdpServer } from '@/lib/cdp/process-manager';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/windows/cdp-start — Start the Antigravity CDP server.
 * 
 * Body (optional):
 *   { "projectDir": "/path/to/project", "killExisting": false }
 * 
 * If projectDir is not provided, defaults to ".".
 * If killExisting is true, all existing Antigravity instances are killed first.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const projectDir = body.projectDir || '.';
    const killExisting = body.killExisting === true;

    const result = await startCdpServer(projectDir, killExisting);

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
