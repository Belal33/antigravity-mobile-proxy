import { NextResponse } from 'next/server';
import { ensureCdpConnection } from '@/lib/init';
import ctx from '@/lib/context';
import * as dns from 'dns';

export const dynamic = 'force-dynamic';

function probeNetwork(): Promise<boolean> {
  return new Promise((resolve) => {
    dns.lookup('dns.google', (err) => resolve(!err));
  });
}

export async function GET() {
  const networkOnline = await probeNetwork();
  
  // Only attempt CDP connection if network is online
  let cdpConnected = false;
  let cdpError: string | null = null;
  if (networkOnline) {
    try {
      await ensureCdpConnection();
      cdpConnected = !!ctx.workbenchPage;
    } catch (e: any) {
      cdpError = e.message;
    }
  }

  const status = cdpConnected ? 'ok' : networkOnline ? 'cdp_error' : 'offline';

  return NextResponse.json({
    status,
    connected: cdpConnected,
    network: networkOnline,
    ...(cdpError ? { error: cdpError } : {}),
    timestamp: Date.now(),
  });
}
