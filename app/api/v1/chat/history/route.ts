import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import { getChatHistory } from '@/lib/scraper/chat-history';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureCdpConnection();
  if (!ctx.workbenchPage) {
    return NextResponse.json(
      { error: 'Not connected to Antigravity' },
      { status: 503 }
    );
  }

  try {
    const history = await getChatHistory(ctx);
    return NextResponse.json(history);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
