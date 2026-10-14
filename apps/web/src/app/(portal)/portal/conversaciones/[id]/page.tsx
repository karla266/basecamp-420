import { api } from '@/lib/api'
import type { Message } from '@/lib/types'

type Thread = { contactName: string; messages: Message[] }

export default async function PortalThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ org?: string }>
}) {
  const { id } = await params
  const { org = '' } = await searchParams
  const thread = await api<Thread>(`/organizations/${org}/conversations/${id}`)
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{thread.contactName}</h1>
      <ol className="space-y-2">
        {thread.messages.map((message) => (
          <li key={message.id} className="rounded-md border border-line bg-white px-3 py-2 text-sm">
            <p className="text-ink/50">{message.direction === 'outbound' ? 'Equipo' : 'Contacto'}</p>
            <p>{message.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
