import { NextRequest, NextResponse } from 'next/server';
import { getRecentProjects } from '@/lib/cdp/recent-projects';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/windows/recent — List recently opened Antigravity projects.
 * 
 * Query params:
 *   ?limit=10  (default: 15)
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '15', 10);
    const recentProjects = getRecentProjects(limit);

    return NextResponse.json({ recentProjects });
  } catch (e: any) {
    return NextResponse.json(
      { recentProjects: [], error: e.message },
      { status: 500 },
    );
  }
}
