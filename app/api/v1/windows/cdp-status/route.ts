import { NextResponse } from 'next/server';
import { isCdpServerActive, getWindowTargets } from '@/lib/cdp/process-manager';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/windows/cdp-status — Check if the CDP server is active.
 * Returns the status and a list of open workbench windows.
 */
export async function GET() {
  try {
    const status = await isCdpServerActive();
    let targets: { id: string; title: string; url: string }[] = [];

    if (status.active) {
      const result = await getWindowTargets();
      targets = result.targets;
    }

    return NextResponse.json({
      active: status.active,
      windowCount: status.windowCount,
      targets,
      error: status.error || null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { active: false, windowCount: 0, targets: [], error: e.message },
      { status: 500 },
    );
  }
}
