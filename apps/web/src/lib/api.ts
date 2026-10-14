import { SESSION_COOKIE } from '@basecamp/shared'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const jar = await cookies()
  const session = jar.get(SESSION_COOKIE)?.value
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (session) headers.set('cookie', `${SESSION_COOKIE}=${session}`)
  const response = await fetch(`${process.env.API_URL ?? 'http://localhost:3001'}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  })
  if (response.status === 401) redirect('/login')
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(body.error ?? 'No se pudo completar la solicitud', response.status)
  }
  return (await response.json()) as T
}
