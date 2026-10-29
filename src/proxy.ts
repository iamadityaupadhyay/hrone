import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 1. Whitelisted public routes, API cron, and static assets
  if (
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/auth/session') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Check Cookie Session
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(sessionCookie);

  // If already authenticated and visiting /login, redirect to /
  if (session.valid) {
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // If visiting /login and not authenticated, allow page to load
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // 3. Fallback: Check HTTP Basic Auth (allows automated curls, scripts, and legacy tests)
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
        // invalid base64, fall through
      }
    }
  }

  // 4. Unauthorized: API requests return 401 JSON; browser page requests redirect to /login
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'Authentication required. Please sign in.' },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/login', req.url);
  if (pathname !== '/') {
    loginUrl.searchParams.set('redirect', pathname);
  }
  return NextResponse.redirect(loginUrl);
}

// Next.js 16 proxy convention
export default proxy;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
