import { NextRequest, NextResponse } from 'next/server';
import { adminSecret, isOwner, OWNER_COOKIE } from '@/lib/ownerAuth';

export async function GET() {
  try {
    return NextResponse.json({ owner: await isOwner() });
  } catch {
    return NextResponse.json({ owner: false });
  }
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== adminSecret()) return NextResponse.json({ error: 'Неверный пароль' }, { status: 401 });

  const res = NextResponse.json({ owner: true });
  res.cookies.set(OWNER_COOKIE, adminSecret(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ owner: false });
  res.cookies.delete(OWNER_COOKIE);
  return res;
}
