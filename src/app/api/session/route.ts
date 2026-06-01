import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createUserSessionValue, getCurrentUser, USER_COOKIE } from '@/lib/userAuth';

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message.trim() ? e.message : 'Internal server error';
}

export async function GET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const login = typeof data.login === 'string' ? data.login : '';
    const password = typeof data.password === 'string' ? data.password : '';
    const user = await authenticateUser(login, password);
    if (!user) return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });

    const res = NextResponse.json({ user });
    res.cookies.set(USER_COOKIE, createUserSessionValue(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    return res;
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ user: null });
  res.cookies.delete(USER_COOKIE);
  return res;
}
