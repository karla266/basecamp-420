import { randomUUID } from 'node:crypto'
import type { Store } from '../store/store'

export async function writeAudit(
  store: Store,
  input: {
    actorId?: string | null
    organizationId?: string | null
    action: string
    entityType: string
    entityId: string
    requestId?: string
  },
): Promise<void> {
  await store.createAuditLog({
    id: randomUUID(),
    actorId: input.actorId ?? null,
    organizationId: input.organizationId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: input.requestId ?? null,
  })
}
