import type { Actor } from '@basecamp/shared'
import type { Store } from '../store/store'
import { assertOrganizationAccess, scopeIds } from '../tenancy/access'

function startOfTodayMexico(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [year, month, day] = parts.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 6, 0, 0))
}

export class SummaryService {
  constructor(private readonly store: Store) {}

  async get(actor: Actor, organizationId?: string) {
    if (organizationId) assertOrganizationAccess(actor, organizationId)
    const organizationIds = organizationId ? [organizationId] : scopeIds(actor)
    const [activeOrganizations, openConversations, callsToday] = await Promise.all([
      this.store.countOrganizations({ ids: organizationIds, active: true }),
      this.store.countConversations({ organizationIds, status: 'open' }),
      this.store.countCalls({ organizationIds, createdAfter: startOfTodayMexico() }),
    ])
    return { activeOrganizations, openConversations, callsToday }
  }
}
