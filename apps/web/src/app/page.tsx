import { SESSION_COOKIE } from '@basecamp/shared'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { api } from '@/lib/api'
import type { Me } from '@/lib/types'

export default async function HomePage() {
  const session = (await cookies()).get(SESSION_COOKIE)?.value
  if (!session) redirect('/login')
  const me = await api<Me>('/auth/me')
  if (me.canAccessAdmin) redirect('/admin')
  if (me.canAccessPortal) redirect('/portal')
  redirect('/login')
}
