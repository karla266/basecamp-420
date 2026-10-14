import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { currentOrganization } from '@/lib/org'
import type { Me, Summary } from '@/lib/types'

export default async function AdminHomePage() {
  const me = await api<Me>('/auth/me')
  const organization = await currentOrganization(me)
  const summary = await api<Summary>(organization ? `/summary?organizationId=${organization.id}` : '/summary')
  const cards = [
    { label: 'Clientes activos', value: summary.activeOrganizations },
    { label: 'Conversaciones abiertas', value: summary.openConversations },
    { label: 'Llamadas de hoy', value: summary.callsToday },
  ]
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Resumen</h1>
        <p className="text-sm text-ink/70">
          {organization ? organization.name : 'Todo tu alcance. Los ceros también cuentan.'}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-ink/60">{card.label}</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums">{card.value}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
