import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  // Allow cron endpoint to be accessed by external cron services without basic auth
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith('/api/cron')) {
    return NextResponse.next();
  }

  const basicAuth = req.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    if (authValue) {
      const [user, pwd] = atob(authValue).split(':');

      const validUser = process.env.BASIC_AUTH_USER || process.env.ADMIN_USER || 'admin';
      const validPass = process.env.BASIC_AUTH_PASSWORD || process.env.ADMIN_PASSWORD || 'hrone@123';

      if (user === validUser && pwd === validPass) {
        return NextResponse.next();
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

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (*.svg, *.png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
