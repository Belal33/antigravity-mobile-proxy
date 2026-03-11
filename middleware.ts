import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  
  if (!auth) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Antigravity Chat Proxy"',
      },
    });
  }

  const [, encoded] = auth.split(' ');
  const [user, pass] = Buffer.from(encoded || '', 'base64').toString().split(':');
  
  if (user !== process.env.APP_USER || pass !== process.env.APP_PASSWORD) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Antigravity Chat Proxy"',
      },
    });
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
