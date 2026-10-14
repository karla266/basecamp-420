import { randomUUID } from 'node:crypto'
import { FakeMessageGateway, FakeVoiceGateway } from '@basecamp/comms'
import { hashPassword } from '@basecamp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAppContext, type AppContext } from '../context'
import { AppError } from '../errors'
import { createBufferLogger } from '../logging/logger'
import { dispatchJob } from '../queue/dispatch'
import type { JobEnqueuer, QueueName } from '../queue/queue'
import { MemoryRateLimiter } from '../rate-limit/rate-limiter'
import { MemoryStore } from '../store/memory-store'
import { MemoryObjectStorage } from '../storage/storage'

const SECRET = 'test-secret'

function inlineQueue(getApp: () => AppContext): JobEnqueuer {
  const pending: Array<{ queue: QueueName; data: Record<string, unknown> }> = []
  let draining = false
  return {
    async enqueue(queue, data) {
      pending.push({ queue, data })
      if (draining) return
      draining = true
      try {
        while (pending.length > 0) {
          const job = pending.shift()
          if (!job) break
          await dispatchJob(getApp(), job)
        }
      } finally {
        draining = false
      }
    },
  }
}

async function harness() {
  const store = new MemoryStore()
  const messages = new FakeMessageGateway()
  const voice = new FakeVoiceGateway()
  const storage = new MemoryObjectStorage()
  const { logger, lines } = createBufferLogger()
  const holder: { app: AppContext } = { app: undefined as unknown as AppContext }
  holder.app = createAppContext({
    store,
    messages,
    voice,
    storage,
    queue: inlineQueue(() => holder.app),
    rateLimiter: new MemoryRateLimiter(30),
    logger,
    authSecret: SECRET,
    fromNumber: '+15005550006',
  })
  const admin = await store.createUser({
    id: randomUUID(),
    email: 'admin@basecamp420.local',
    name: 'Administrador',
    passwordHash: hashPassword('change-me-now'),
  })
  await store.createMembership({
    id: randomUUID(),
    userId: admin.id,
    organizationId: null,
    role: 'platform_admin',
  })
  return { app: holder.app, store, messages, voice, storage, lines }
}

describe('operator flow', () => {
  let env: Awaited<ReturnType<typeof harness>>

  beforeEach(async () => {
    env = await harness()
  })

  it('logs in, isolates tenants, sends SMS, runs a sequence, and stores a recording reference', async () => {
    const adminLogin = await env.app.auth.login('admin@basecamp420.local', 'change-me-now')
    const admin = adminLogin.actor
    const acme = await env.app.clients.createOrganization(admin, { name: 'Acme' })
    const other = await env.app.clients.createOrganization(admin, { name: 'Otra' })
    const invited = await env.app.admin.invite(
      admin,
      { email: 'operador@basecamp420.local', role: 'operator', organizationId: acme.id },
    )
    const token = new URL(`http://local${invited.acceptPath}`).searchParams.get('token')
    await env.app.admin.acceptInvite({ token: token ?? '', name: 'Operador Uno', password: 'change-me-now' })
    const outsiderInvite = await env.app.admin.invite(admin, {
      email: 'otro@basecamp420.local',
      role: 'operator',
      organizationId: other.id,
    })
    const outsiderToken = new URL(`http://local${outsiderInvite.acceptPath}`).searchParams.get('token')
    await env.app.admin.acceptInvite({
      token: outsiderToken ?? '',
      name: 'Operador Dos',
      password: 'change-me-now',
    })
    const clientInvite = await env.app.admin.invite(admin, {
      email: 'cliente@basecamp420.local',
      role: 'client_viewer',
      organizationId: acme.id,
    })
    const clientToken = new URL(`http://local${clientInvite.acceptPath}`).searchParams.get('token')
    await env.app.admin.acceptInvite({ token: clientToken ?? '', name: 'Cliente', password: 'change-me-now' })

    const operator = (await env.app.auth.login('operador@basecamp420.local', 'change-me-now')).actor
    const outsider = (await env.app.auth.login('otro@basecamp420.local', 'change-me-now')).actor
    const client = (await env.app.auth.login('cliente@basecamp420.local', 'change-me-now')).actor
    expect((await env.app.auth.me(client)).canAccessAdmin).toBe(false)
    await expect(env.app.clients.listContacts(outsider, acme.id, {})).rejects.toMatchObject({ status: 403 })

    const template = await env.app.messaging.createTemplate(operator, acme.id, {
      name: 'Bienvenida',
      body: 'Hola {{name}}',
    })
    await env.app.automations.create(operator, acme.id, {
      name: 'Alta',
      trigger: 'contact_created',
      steps: [
        { templateId: template.id, waitMinutes: 0 },
        { templateId: template.id, waitMinutes: 0 },
      ],
    })
    const contact = await env.app.clients.createContact(operator, acme.id, {
      name: 'Ana',
      phone: '+525512345678',
    })
    expect(contact.smsConsent).toBe(false)
    await env.app.clients.setConsent(operator, acme.id, contact.id, { smsConsent: true })
    expect(env.messages.sent.map((item) => item.body)).toEqual(['Hola Ana', 'Hola Ana'])
    expect(env.store.runSteps.length).toBe(2)
    expect(env.store.runSteps.every((step) => step.status === 'sent')).toBe(true)

    await env.app.messaging.sendManual(operator, acme.id, { contactId: contact.id, body: 'Mensaje manual' })
    expect(env.messages.sent.at(-1)?.body).toBe('Mensaje manual')

    const first = await env.app.messaging.acceptInboundWebhook({
      messageSid: 'SM-in-1',
      from: contact.phone,
      to: '+15005550006',
      body: 'STOP',
    })
    const second = await env.app.messaging.acceptInboundWebhook({
      messageSid: 'SM-in-1',
      from: contact.phone,
      to: '+15005550006',
      body: 'STOP',
    })
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(env.store.messages.filter((message) => message.direction === 'inbound')).toHaveLength(1)
    await expect(
      env.app.messaging.sendManual(operator, acme.id, { contactId: contact.id, body: 'Otro' }),
    ).rejects.toBeInstanceOf(AppError)

    await env.app.clients.setConsent(operator, acme.id, contact.id, { callConsent: true })
    const placed = await env.app.calls.place(operator, acme.id, contact.id)
    const saved = await env.store.findCallById(placed.id)
    expect(saved?.providerCallId).toMatch(/^CA/)
    const completed = env.voice.statusSequence(saved!.providerCallId!).at(-1)
    await env.app.calls.applyStatus({
      callSid: saved!.providerCallId!,
      callStatus: completed!.callStatus,
      recordingUrl: completed!.recordingUrl,
      recordingSid: completed!.recordingSid,
      recordingDuration: completed!.recordingDuration,
    })
    expect(env.storage.objects).toHaveLength(1)
    expect(env.storage.objects[0]?.url.startsWith('memory://')).toBe(true)
    expect(JSON.stringify(env.storage.objects[0])).not.toContain('"bytes"')

    const summary = await env.app.summary.get(operator, acme.id)
    expect(summary.activeOrganizations).toBe(1)
    expect(summary.openConversations).toBe(1)
    expect(summary.callsToday).toBe(1)
    await expect(env.app.summary.get(operator, other.id)).rejects.toMatchObject({ status: 403 })
    expect(env.lines.join('\n')).not.toContain('+525512345678')
    expect(env.lines.join('\n')).not.toContain('Mensaje manual')
  })

  it('stops outbound SMS after the organization limit', async () => {
    const admin = (await env.app.auth.login('admin@basecamp420.local', 'change-me-now')).actor
    const org = await env.app.clients.createOrganization(admin, { name: 'Cupo' })
    const contact = await env.app.clients.createContact(admin, org.id, { name: 'Leo', phone: '+525500000001' })
    await env.app.clients.setConsent(admin, org.id, contact.id, { smsConsent: true })
    for (let index = 0; index < 30; index += 1) {
      await env.app.messaging.sendManual(admin, org.id, { contactId: contact.id, body: `Aviso ${index}` })
    }
    await expect(
      env.app.messaging.sendManual(admin, org.id, { contactId: contact.id, body: 'De más' }),
    ).rejects.toMatchObject({ status: 429 })
  })
})
