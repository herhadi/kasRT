import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const maintenanceEnabled = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MAINTENANCE_MODE || '').trim().toLowerCase()
);

export function proxy(request: NextRequest) {
  if (!maintenanceEnabled) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const isMaintenancePage = pathname === '/maintenance';
  const isNextAsset = pathname.startsWith('/_next/');
  const isApiRoute = pathname.startsWith('/api/');
  const isPublicFile = /\.[^/]+$/.test(pathname);

  if (isMaintenancePage || isNextAsset || isApiRoute || isPublicFile) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/maintenance', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
