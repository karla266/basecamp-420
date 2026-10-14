export const ROLES = ['platform_admin', 'operator', 'client_admin', 'client_viewer'] as const

export type Role = (typeof ROLES)[number]

export const SESSION_COOKIE = 'basecamp_session'
export const ORG_COOKIE = 'basecamp_org'

export type MembershipRef = {
  organizationId: string | null
  role: Role
}

export type Actor = {
  userId: string
  email: string
  name: string
  memberships: MembershipRef[]
  operatorOrganizationIds: string[]
}

export function isPlatformAdmin(actor: Actor): boolean {
  return actor.memberships.some((membership) => membership.role === 'platform_admin')
}

export function canAccessAdmin(actor: Actor): boolean {
  return actor.memberships.some(
    (membership) => membership.role === 'platform_admin' || membership.role === 'operator',
  )
}

export function canAccessPortal(actor: Actor): boolean {
  return actor.memberships.some(
    (membership) => membership.role === 'client_admin' || membership.role === 'client_viewer',
  )
}

export function canAccessOrganization(actor: Actor, organizationId: string): boolean {
  if (isPlatformAdmin(actor)) return true
  if (actor.operatorOrganizationIds.includes(organizationId)) return true
  return actor.memberships.some(
    (membership) =>
      membership.organizationId === organizationId &&
      (membership.role === 'client_admin' ||
        membership.role === 'client_viewer' ||
        membership.role === 'operator'),
  )
}

export function canOperate(actor: Actor, organizationId: string): boolean {
  return isPlatformAdmin(actor) || actor.operatorOrganizationIds.includes(organizationId)
}

export function canInvite(actor: Actor, organizationId: string | null, role: Role): boolean {
  if (isPlatformAdmin(actor)) return true
  if (!organizationId) return false
  if (role !== 'client_admin' && role !== 'client_viewer') return false
  return actor.memberships.some(
    (membership) => membership.organizationId === organizationId && membership.role === 'client_admin',
  )
}

export function organizationIdsInScope(actor: Actor): string[] | 'all' {
  if (isPlatformAdmin(actor)) return 'all'
  const ids = new Set<string>(actor.operatorOrganizationIds)
  for (const membership of actor.memberships) {
    if (membership.organizationId) ids.add(membership.organizationId)
  }
  return [...ids]
}
