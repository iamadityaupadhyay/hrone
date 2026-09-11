import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Allow cron endpoint to be accessed by external cron services without basic auth
  if (pathname.startsWith('/api/cron')) {
    return NextResponse.next();
  }

  const basicAuth = req.headers.get('authorization');

  if (basicAuth && basicAuth.startsWith('Basic ')) {
    const authValue = basicAuth.split(' ')[1];
    if (authValue) {
      try {
        const [user, pwd] = atob(authValue).split(':');

        const validUser = process.env.BASIC_AUTH_USER || process.env.ADMIN_USER || 'admin';
        const validPass = process.env.BASIC_AUTH_PASSWORD || process.env.ADMIN_PASSWORD || 'hrone@123';

        if (user === validUser && pwd === validPass) {
          return NextResponse.next();
        }
      } catch {
        // invalid base64, fall through to 401
      }
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="HROne Attendance Dashboard"',
    },
  });
}

// Next.js 16 proxy convention
export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (*.svg, *.png, etc.)
     * - api/cron
     */
    '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
