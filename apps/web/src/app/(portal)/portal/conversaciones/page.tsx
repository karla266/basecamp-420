import Link from 'next/link'
import { api } from '@/lib/api'
import { formatWhen } from '@/lib/format'
import { currentOrganization } from '@/lib/org'
import type { Conversation, Me, Page } from '@/lib/types'

export default async function PortalConversationsPage() {
  const me = await api<Me>('/auth/me')
  const organization = await currentOrganization(me)
  if (!organization) return <p>No hay una organización asignada.</p>
  const result = await api<Page<Conversation>>(`/organizations/${organization.id}/conversations?pageSize=50`)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Conversaciones</h1>
      <ul className="space-y-2 text-sm">
        {result.items.map((conversation) => (
          <li key={conversation.id}>
            <Link href={`/portal/conversaciones/${conversation.id}?org=${organization.id}`}>
              {conversation.contactName} · {formatWhen(conversation.updatedAt)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
