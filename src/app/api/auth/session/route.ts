import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { getDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const masterUser = process.env.BASIC_AUTH_USER || process.env.ADMIN_USER || 'admin';
    const masterPass = process.env.BASIC_AUTH_PASSWORD || process.env.ADMIN_PASSWORD || 'hrone@123';

    let isAuthenticated = false;
    let authUser = {
      username,
      name: 'Administrator',
      isSuperAdmin: true,
      role: 'SUPER_ADMIN',
    };

    // 1. Check Master Admin Credentials
    if (username.toLowerCase() === masterUser.toLowerCase() && password === masterPass) {
      isAuthenticated = true;
    } else {
      // 2. Check Database for enrolled Super Admins or active employees with matching password
      try {
        const db = await getDatabase();
        const numId = !isNaN(Number(username)) ? Number(username) : null;
        const query: Record<string, unknown> = {
          $or: [
            { username: { $regex: new RegExp(`^${username}$`, 'i') } },
            { mobileNumber: username },
            ...(numId ? [{ employeeId: numId }] : []),
          ],
        };

        const emp = await db.collection('employees').findOne(query);
        if (emp && emp.password && emp.password === password) {
          isAuthenticated = true;
          authUser = {
            username: emp.username || String(emp.employeeId),
            name: emp.name || username,
            isSuperAdmin: Boolean(emp.isSuperAdmin || emp.employeeId === 2357),
            role: emp.isSuperAdmin ? 'SUPER_ADMIN' : 'EMPLOYEE',
          };
        }
      } catch (dbErr) {
        console.error('[Auth API] Error verifying against MongoDB:', dbErr);
      }
    }

    if (!isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    const token = await createSessionToken(authUser.username);
    const res = NextResponse.json({
      success: true,
      message: 'Authentication successful',
      user: authUser,
    });

    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Login failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const verified = await verifySessionToken(token);

  if (!verified.valid) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    username: verified.username,
  });
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: 'Logged out successfully' });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  });
  return res;
}

