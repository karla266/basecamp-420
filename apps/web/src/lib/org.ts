import { ORG_COOKIE, canOperate, isPlatformAdmin, type Actor } from '@basecamp/shared'
import { cookies } from 'next/headers'
import type { Me } from './types'

export function actorFromMe(me: Me): Actor {
  return {
    userId: me.user.id,
    email: me.user.email,
    name: me.user.name,
    memberships: me.memberships,
    operatorOrganizationIds: me.operatorOrganizationIds,
  }
}

export async function currentOrganization(me: Me) {
  const selected = (await cookies()).get(ORG_COOKIE)?.value
  if (selected) {
    const match = me.organizations.find((organization) => organization.id === selected)
    if (match) return match
  }
  if (me.organizations.length === 1) return me.organizations[0] ?? null
  return null
}

export function canOperateOrg(me: Me, organizationId: string): boolean {
  return canOperate(actorFromMe(me), organizationId)
}

export function platformAdmin(me: Me): boolean {
  return isPlatformAdmin(actorFromMe(me))
}
