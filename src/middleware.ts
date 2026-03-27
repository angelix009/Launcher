import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth/', '/api/'];
const STATIC_PREFIXES = ['/_next/', '/favicon.ico'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and public paths
  if (
    STATIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('lf_auth')?.value;

  // Cookie must exist and look like a valid AES-GCM token (iv:tag:ciphertext)
  if (!token || token.split(':').length !== 3) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
