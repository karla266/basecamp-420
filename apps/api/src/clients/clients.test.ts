import { describe, expect, it } from 'vitest'
import { createTestApp, seedUser } from '../testing/create-test-app'

describe('clients', () => {
  it('isolates operators and keeps consent off until it is registered', async () => {
    const app = await createTestApp()
    const admin = await seedUser(app, {
      email: 'admin@test.local',
      password: 'admin-pass-1',
      role: 'platform_admin',
    })
    const orgA = await app.clients.createOrganization(admin.actor, { name: 'Norte' }, 'req')
    const orgB = await app.clients.createOrganization(admin.actor, { name: 'Sur' }, 'req')
    const operatorA = await seedUser(app, {
      email: 'a@test.local',
      password: 'operator-pass',
      role: 'operator',
    })
    const operatorB = await seedUser(app, {
      email: 'b@test.local',
      password: 'operator-pass',
      role: 'operator',
      organizationId: orgB.id,
    })
    await app.clients.assignOperator(admin.actor, orgA.id, operatorA.userId, 'req')
    const actorA = await app.auth.authenticate(operatorA.token)
    if (!actorA) throw new Error('missing actor')
    const contact = await app.clients.createContact(
      actorA,
      orgA.id,
      { name: 'Karla', phone: '+525512345678' },
      'req',
    )
    expect(contact.smsConsent).toBe(false)
    expect(contact.callConsent).toBe(false)
    const visible = await app.clients.listContacts(actorA, orgA.id, { q: 'karla', page: 1 })
    expect(visible.total).toBe(1)
    await expect(app.clients.listContacts(operatorB.actor, orgA.id, {})).rejects.toMatchObject({ status: 403 })
    await expect(app.clients.listContacts(actorA, orgB.id, {})).rejects.toMatchObject({ status: 403 })
    await expect(
      app.clients.createContact(actorA, orgA.id, { name: 'Mal', phone: '5512345678' }, 'req'),
    ).rejects.toMatchObject({ status: 400 })
  })
})
