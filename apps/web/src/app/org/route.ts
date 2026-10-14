import { ORG_COOKIE } from '@basecamp/shared'
import { NextResponse } from 'next/server'
import { api } from '@/lib/api'
import type { Me } from '@/lib/types'

function safeBack(request: Request): URL {
  const fallback = new URL('/admin', request.url)
  const referer = request.headers.get('referer')
  if (!referer) return fallback
  try {
    const url = new URL(referer)
    if (url.origin !== new URL(request.url).origin) return fallback
    return url
  } catch {
    return fallback
  }
}

export async function POST(request: Request) {
  const form = await request.formData()
  const organizationId = String(form.get('organizationId') ?? '')
  const me = await api<Me>('/auth/me')
  const back = safeBack(request)
  if (!me.organizations.some((organization) => organization.id === organizationId)) {
    return NextResponse.redirect(back, 303)
  }
  const response = NextResponse.redirect(back, 303)
  response.cookies.set(ORG_COOKIE, organizationId, { httpOnly: true, sameSite: 'lax', path: '/' })
  return response
}
