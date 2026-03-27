import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { encryptData } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    const sitePassword = process.env.SITE_PASSWORD;
    if (!sitePassword) {
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500 },
      );
    }

    // Constant-time comparison
    const a = Buffer.from(password ?? '', 'utf8');
    const b = Buffer.from(sitePassword, 'utf8');
    const match =
      a.length === b.length && timingSafeEqual(a, b);

    if (!match) {
      return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
    }

    // Create encrypted session token
    const token = encryptData(JSON.stringify({ ts: Date.now() }));
    const isProd = process.env.NODE_ENV === 'production';

    const response = NextResponse.json({ ok: true });
    response.cookies.set('lf_auth', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
