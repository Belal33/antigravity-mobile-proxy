import { NextRequest, NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { selectWindow } from '@/lib/cdp/connection';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/windows/select — switch to a different workbench window.
 */
export async function POST(request: NextRequest) {
  await ensureCdpConnection();

  const body = await request.json();
  const { index } = body;
  if (index === undefined || index === null) {
    return NextResponse.json(
      { error: 'index is required' },
      { status: 400 }
    );
  }

  try {
    const info = selectWindow(ctx, index);
    return NextResponse.json({
      success: true,
      window: { index, title: info.title, url: info.url },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: 400 }
    );
  }
}
