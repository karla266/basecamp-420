import { Notice } from '@/components/notice'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { sendMessageAction } from '@/lib/actions'
import { api } from '@/lib/api'
import { formatWhen } from '@/lib/format'
import { canOperateOrg, currentOrganization } from '@/lib/org'
import type { Conversation, Me, Message } from '@/lib/types'

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>
  searchParams: Promise<{ org?: string; aviso?: string }>
}) {
  const { conversationId } = await params
  const query = await searchParams
  const me = await api<Me>('/auth/me')
  const selected = await currentOrganization(me)
  const organizationId = query.org ?? selected?.id
  if (!organizationId) return <p>Elige una organización.</p>
  const thread = await api<Conversation & { messages: Message[] }>(
    `/organizations/${organizationId}/conversations/${conversationId}`,
  )
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{thread.contactName}</h1>
        <p className="text-sm text-ink/60">{thread.contactPhone}</p>
      </div>
      <Notice message={query.aviso} />
      <Card>
        <ol className="space-y-3">
          {thread.messages.map((message) => (
            <li key={message.id} className={message.direction === 'outbound' ? 'ml-8' : 'mr-8'}>
              <p className="text-xs uppercase tracking-wide text-ink/50">
                {message.direction === 'outbound' ? 'Saliente' : 'Entrante'} · {message.status} · {formatWhen(message.createdAt)}
              </p>
              <p className="mt-1 rounded-lg bg-paper px-3 py-2">{message.body}</p>
            </li>
          ))}
        </ol>
      </Card>
      {canOperateOrg(me, organizationId) ? (
        <Card>
          <form action={sendMessageAction} className="space-y-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="contactId" value={thread.contactId} />
            <label className="block space-y-1 text-sm">
              <span>Mensaje manual</span>
              <textarea name="body" className="field min-h-24" required maxLength={640} />
            </label>
            <Button type="submit">Enviar SMS</Button>
          </form>
        </Card>
      ) : null}
    </div>
  )
}
