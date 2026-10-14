import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Shell } from '@/components/shell'
import { api } from '@/lib/api'
import { currentOrganization } from '@/lib/org'
import type { Me } from '@/lib/types'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await api<Me>('/auth/me')
  if (!me.canAccessAdmin) redirect('/portal')
  const organization = await currentOrganization(me)
  return (
    <Shell me={me} area="admin" selectedId={organization?.id}>
      {children}
    </Shell>
  )
}
