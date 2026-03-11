import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureCdpConnection();
  return NextResponse.json({
    status: 'ok',
    connected: !!ctx.workbenchPage,
  });
}
