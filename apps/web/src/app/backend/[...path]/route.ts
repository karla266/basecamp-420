import { NextRequest, NextResponse } from 'next/server'

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const target = `${process.env.API_URL ?? 'http://localhost:3001'}/${path.join('/')}${request.nextUrl.search}`
  const headers = new Headers()
  const cookie = request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
  })
  const outbound = new NextResponse(await response.arrayBuffer(), { status: response.status })
  const type = response.headers.get('content-type')
  if (type) outbound.headers.set('content-type', type)
  for (const setCookie of response.headers.getSetCookie()) {
    outbound.headers.append('set-cookie', setCookie)
  }
  return outbound
}

export const GET = proxy
export const POST = proxy
export const PATCH = proxy
export const DELETE = proxy
