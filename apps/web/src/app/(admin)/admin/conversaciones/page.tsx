import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatWhen } from '@/lib/format'
import { currentOrganization } from '@/lib/org'
import type { Conversation, Me, Page } from '@/lib/types'

export default async function ConversationsPage() {
  const me = await api<Me>('/auth/me')
  const organization = await currentOrganization(me)
  if (!organization) return <p>Selecciona una organización para ver conversaciones.</p>
  const result = await api<Page<Conversation>>(`/organizations/${organization.id}/conversations?pageSize=50`)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Conversaciones</h1>
      <Card>
        <ul className="space-y-2 text-sm">
          {result.items.length === 0 ? <li className="text-ink/60">No hay conversaciones abiertas.</li> : null}
          {result.items.map((conversation) => (
            <li key={conversation.id}>
              <Link className="underline-offset-2 hover:underline" href={`/admin/conversaciones/${conversation.id}?org=${organization.id}`}>
                {conversation.contactName} · {formatWhen(conversation.updatedAt)}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
