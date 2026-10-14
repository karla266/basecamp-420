import { describe, expect, it } from 'vitest'
import {
  canAccessAdmin,
  canAccessOrganization,
  canAccessPortal,
  canInvite,
  canOperate,
  type Actor,
} from './permissions'

function actor(partial: Partial<Actor> & Pick<Actor, 'memberships' | 'operatorOrganizationIds'>): Actor {
  return {
    userId: 'user',
    email: 'user@basecamp.local',
    name: 'Usuario',
    ...partial,
  }
}

describe('tenant access', () => {
  const orgA = 'org-a'
  const orgB = 'org-b'

  const platformAdmin = actor({
    memberships: [{ organizationId: null, role: 'platform_admin' }],
    operatorOrganizationIds: [],
  })
  const operatorA = actor({
    memberships: [{ organizationId: null, role: 'operator' }],
    operatorOrganizationIds: [orgA],
  })
  const operatorB = actor({
    memberships: [{ organizationId: null, role: 'operator' }],
    operatorOrganizationIds: [orgB],
  })
  const clientAdmin = actor({
    memberships: [{ organizationId: orgA, role: 'client_admin' }],
    operatorOrganizationIds: [],
  })
  const clientViewer = actor({
    memberships: [{ organizationId: orgA, role: 'client_viewer' }],
    operatorOrganizationIds: [],
  })

  it('keeps an operator inside assigned organizations', () => {
    expect(canAccessOrganization(operatorA, orgA)).toBe(true)
    expect(canAccessOrganization(operatorA, orgB)).toBe(false)
    expect(canOperate(operatorA, orgA)).toBe(true)
    expect(canOperate(operatorA, orgB)).toBe(false)
    expect(canAccessOrganization(operatorB, orgA)).toBe(false)
  })

  it('lets a platform admin reach every organization', () => {
    expect(canAccessOrganization(platformAdmin, orgA)).toBe(true)
    expect(canAccessOrganization(platformAdmin, orgB)).toBe(true)
    expect(canOperate(platformAdmin, orgB)).toBe(true)
  })

  it('separates admin routes from the client portal', () => {
    expect(canAccessAdmin(platformAdmin)).toBe(true)
    expect(canAccessAdmin(operatorA)).toBe(true)
    expect(canAccessAdmin(clientAdmin)).toBe(false)
    expect(canAccessAdmin(clientViewer)).toBe(false)
    expect(canAccessPortal(clientAdmin)).toBe(true)
    expect(canAccessPortal(clientViewer)).toBe(true)
    expect(canAccessPortal(operatorA)).toBe(false)
    expect(canAccessPortal(platformAdmin)).toBe(false)
  })

  it('lets a client admin invite only client roles in their organization', () => {
    expect(canInvite(clientAdmin, orgA, 'client_viewer')).toBe(true)
    expect(canInvite(clientAdmin, orgA, 'client_admin')).toBe(true)
    expect(canInvite(clientAdmin, orgA, 'operator')).toBe(false)
    expect(canInvite(clientAdmin, orgB, 'client_viewer')).toBe(false)
    expect(canInvite(clientViewer, orgA, 'client_viewer')).toBe(false)
    expect(canInvite(platformAdmin, null, 'operator')).toBe(true)
  })
})
