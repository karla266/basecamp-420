import { Notice } from '@/components/notice'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatWhen } from '@/lib/format'
import { currentOrganization } from '@/lib/org'
import type { CallItem, Me, Page } from '@/lib/types'

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams
  const me = await api<Me>('/auth/me')
  const organization = await currentOrganization(me)
  if (!organization) return <p>Selecciona una organización para ver llamadas.</p>
  const result = await api<Page<CallItem>>(`/organizations/${organization.id}/calls?pageSize=50`)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Llamadas</h1>
      <Notice message={aviso} />
      <Card>
        <ul className="space-y-2 text-sm">
          {result.items.length === 0 ? <li className="text-ink/60">Todavía no hay llamadas.</li> : null}
          {result.items.map((call) => (
            <li key={call.id}>
              {call.contactName} · {call.status} · {formatWhen(call.createdAt)}
              {call.recordings[0] ? ' · referencia de grabación' : ''}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
