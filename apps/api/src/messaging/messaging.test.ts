import { describe, expect, it } from 'vitest'
import { createTestApp, seedUser } from '../testing/create-test-app'

async function readyContact() {
  const app = await createTestApp()
  const admin = await seedUser(app, {
    email: 'admin@test.local',
    password: 'admin-pass-1',
    role: 'platform_admin',
  })
  const org = await app.clients.createOrganization(admin.actor, { name: 'Mensajes' }, 'req')
  const operator = await seedUser(app, {
    email: 'op@test.local',
    password: 'operator-pass',
    role: 'operator',
    organizationId: org.id,
  })
  const contact = await app.clients.createContact(
    operator.actor,
    org.id,
    { name: 'Ana', phone: '+525512345678' },
    'req',
  )
  return { app, operator, org, contact }
}

describe('messaging', () => {
  it('sends a manual sms through the fake adapter', async () => {
    const { app, operator, org, contact } = await readyContact()
    await app.clients.setConsent(operator.actor, org.id, contact.id, { smsConsent: true }, 'req')
    const message = await app.messaging.sendManual(
      operator.actor,
      org.id,
      { contactId: contact.id, body: 'Hola Ana' },
      'req-send',
    )
    expect(message.status).toBe('queued')
    await app.drain()
    expect(app.messages.sent).toEqual([
      { to: '+525512345678', from: '+15005550006', body: 'Hola Ana' },
    ])
    const sent = await app.store.findMessageById(message.id)
    expect(sent?.status).toBe('sent')
  })

  it('does not duplicate an inbound webhook and honors STOP', async () => {
    const { app, operator, org, contact } = await readyContact()
    await app.clients.setConsent(operator.actor, org.id, contact.id, { smsConsent: true }, 'req')
    const payload = { messageSid: 'SM100', from: '+525512345678', to: '+15005550006', body: 'Hola' }
    const first = await app.messaging.acceptInboundWebhook(payload)
    const second = await app.messaging.acceptInboundWebhook(payload)
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    await app.drain()
    const conversations = await app.messaging.listConversations(operator.actor, org.id, {})
    const thread = await app.messaging.getConversation(
      operator.actor,
      org.id,
      conversations.items[0]?.id ?? '',
    )
    expect(thread.messages).toHaveLength(1)

    await app.messaging.acceptInboundWebhook({ ...payload, messageSid: 'SM101', body: 'STOP' })
    await app.drain()
    const updated = await app.store.findContactById(contact.id)
    expect(updated?.smsOptOut).toBe(true)
    expect(updated?.smsConsent).toBe(false)
    await expect(
      app.messaging.sendManual(operator.actor, org.id, { contactId: contact.id, body: 'Otra vez' }, 'req'),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('blocks sends without consent and applies the organization rate limit', async () => {
    const app = await createTestApp({ smsLimit: 2 })
    const admin = await seedUser(app, {
      email: 'admin@test.local',
      password: 'admin-pass-1',
      role: 'platform_admin',
    })
    const org = await app.clients.createOrganization(admin.actor, { name: 'Cupo' }, 'req')
    const operator = await seedUser(app, {
      email: 'op@test.local',
      password: 'operator-pass',
      role: 'operator',
      organizationId: org.id,
    })
    const contact = await app.clients.createContact(
      operator.actor,
      org.id,
      { name: 'Ana', phone: '+525500000001' },
      'req',
    )
    await expect(
      app.messaging.sendManual(operator.actor, org.id, { contactId: contact.id, body: 'Hola' }, 'req'),
    ).rejects.toMatchObject({ status: 400 })
    await app.clients.setConsent(operator.actor, org.id, contact.id, { smsConsent: true }, 'req')
    await app.messaging.sendManual(operator.actor, org.id, { contactId: contact.id, body: 'Uno' }, 'req')
    await app.messaging.sendManual(operator.actor, org.id, { contactId: contact.id, body: 'Dos' }, 'req')
    await expect(
      app.messaging.sendManual(operator.actor, org.id, { contactId: contact.id, body: 'Tres' }, 'req'),
    ).rejects.toMatchObject({ status: 429 })
  })
})
