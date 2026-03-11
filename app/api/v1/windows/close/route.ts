import { NextRequest, NextResponse } from 'next/server';
import { closeWindow, getWindowTargets } from '@/lib/cdp/process-manager';
import ctx from '@/lib/context';
import { discoverWorkbenches } from '@/lib/cdp/connection';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/windows/close — Close a specific Antigravity window.
 * 
 * Body:
 *   { "targetId": "CDP-target-id" }
 *   OR
 *   { "index": 0 }  — closes by window index
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  let { targetId, index } = body;

  // If index is provided instead of targetId, resolve it
  if (!targetId && index !== undefined && index !== null) {
    const { targets } = await getWindowTargets();
    if (index < 0 || index >= targets.length) {
      return NextResponse.json(
        { success: false, message: `Invalid window index ${index}. Available: 0-${targets.length - 1}` },
        { status: 400 },
      );
    }
    targetId = targets[index].id;
  }

  if (!targetId) {
    return NextResponse.json(
      { success: false, message: 'Either targetId or index is required.' },
      { status: 400 },
    );
  }

  try {
    const result = await closeWindow(targetId);

    // After closing, re-discover workbenches
    if (result.success) {
      // Wait a moment for the window to fully close
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        await discoverWorkbenches(ctx);
        // If the active window was closed, reset to first available
        if (ctx.allWorkbenches.length > 0 && ctx.activeWindowIdx >= ctx.allWorkbenches.length) {
          ctx.activeWindowIdx = 0;
          ctx.workbenchPage = ctx.allWorkbenches[0].page;
        }
      } catch {
        // Non-fatal
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
