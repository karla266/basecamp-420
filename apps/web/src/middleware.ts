import { NextResponse, type NextRequest } from 'next/server'

type Me = { canAccessAdmin: boolean; canAccessPortal: boolean }

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('basecamp_session')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const response = await fetch(`${apiUrl}/auth/me`, {
      headers: { cookie: `basecamp_session=${token}` },
      cache: 'no-store',
    })
    if (!response.ok) return NextResponse.redirect(new URL('/login', request.url))
    const me = (await response.json()) as Me
    const path = request.nextUrl.pathname
    if (path.startsWith('/admin') && !me.canAccessAdmin) {
      return NextResponse.redirect(new URL('/portal', request.url))
    }
    if (path.startsWith('/portal') && !me.canAccessPortal) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*'],
}
