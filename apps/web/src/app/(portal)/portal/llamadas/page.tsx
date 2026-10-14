import { api } from '@/lib/api'
import { formatWhen } from '@/lib/format'
import { currentOrganization } from '@/lib/org'
import type { CallItem, Me, Page } from '@/lib/types'

export default async function PortalCallsPage() {
  const me = await api<Me>('/auth/me')
  const organization = await currentOrganization(me)
  if (!organization) return <p>No hay una organización asignada.</p>
  const result = await api<Page<CallItem>>(`/organizations/${organization.id}/calls?pageSize=50`)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Llamadas</h1>
      <ul className="space-y-2 text-sm">
        {result.items.map((call) => (
          <li key={call.id}>
            {call.contactName} · {call.status} · {formatWhen(call.createdAt)}
          </li>
        ))}
      </ul>
    </div>
  )
}
