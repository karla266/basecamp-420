import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { currentOrganization } from '@/lib/org'
import type { Me, Summary } from '@/lib/types'

export default async function PortalHomePage() {
  const me = await api<Me>('/auth/me')
  const organization = await currentOrganization(me)
  const summary = await api<Summary>(organization ? `/summary?organizationId=${organization.id}` : '/summary')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{organization?.name ?? 'Tu organización'}</h1>
        <p className="text-sm text-ink/70">Vista de solo lectura.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-ink/60">Clientes activos</p>
          <p className="mt-2 text-4xl font-semibold">{summary.activeOrganizations}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink/60">Conversaciones abiertas</p>
          <p className="mt-2 text-4xl font-semibold">{summary.openConversations}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink/60">Llamadas de hoy</p>
          <p className="mt-2 text-4xl font-semibold">{summary.callsToday}</p>
        </Card>
      </div>
    </div>
  )
}
