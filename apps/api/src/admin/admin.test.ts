import { describe, expect, it } from 'vitest'
import { createTestApp, seedUser } from '../testing/create-test-app'

describe('admin invitations', () => {
  it('lets a client admin invite a viewer of their org and keeps the summary in scope', async () => {
    const app = await createTestApp()
    const admin = await seedUser(app, {
      email: 'admin@test.local',
      password: 'admin-pass-1',
      role: 'platform_admin',
    })
    const org = await app.clients.createOrganization(admin.actor, { name: 'Cliente Uno' }, 'req')
    const clientAdmin = await seedUser(app, {
      email: 'owner@test.local',
      password: 'client-pass-1',
      role: 'client_admin',
      organizationId: org.id,
    })
    const viewer = await seedUser(app, {
      email: 'view@test.local',
      password: 'client-pass-1',
      role: 'client_viewer',
      organizationId: org.id,
    })
    const invite = await app.admin.invite(
      clientAdmin.actor,
      { email: 'new@test.local', role: 'client_viewer' },
      'req',
    )
    expect(invite.acceptPath).toContain('/invitacion?token=')
    await expect(
      app.admin.invite(clientAdmin.actor, { email: 'op@test.local', role: 'operator' }, 'req'),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      app.admin.invite(viewer.actor, { email: 'other@test.local', role: 'client_viewer' }, 'req'),
    ).rejects.toMatchObject({ status: 403 })
    await expect(app.clients.createOrganization(clientAdmin.actor, { name: 'Otra' }, 'req')).rejects.toMatchObject({
      status: 403,
    })
    const summary = await app.summary.get(clientAdmin.actor)
    expect(summary).toEqual({ activeOrganizations: 1, openConversations: 0, callsToday: 0 })
    const token = new URL(`http://local${invite.acceptPath}`).searchParams.get('token')
    const accepted = await app.admin.acceptInvite(
      { token: token ?? '', name: 'Nuevo', password: 'nueva-pass-1' },
      'req',
    )
    expect(accepted.email).toBe('new@test.local')
  })
})
