import { describe, expect, it } from 'vitest'
import { createTestApp, seedUser } from '../testing/create-test-app'

describe('automations', () => {
  it('runs a consented new contact through each step and retries with a cap', async () => {
    let current = new Date('2026-03-01T15:00:00.000Z')
    const app = await createTestApp({ now: () => current })
    const admin = await seedUser(app, {
      email: 'admin@test.local',
      password: 'admin-pass-1',
      role: 'platform_admin',
    })
    const org = await app.clients.createOrganization(admin.actor, { name: 'Secuencia' }, 'req')
    const operator = await seedUser(app, {
      email: 'op@test.local',
      password: 'operator-pass',
      role: 'operator',
      organizationId: org.id,
    })
    const template = await app.messaging.createTemplate(
      operator.actor,
      org.id,
      { name: 'Bienvenida', body: 'Hola {{name}}' },
      'req',
    )
    const automation = await app.automations.create(
      operator.actor,
      org.id,
      {
        name: 'Alta',
        trigger: 'contact_created',
        steps: [
          { templateId: template.id, waitMinutes: 0 },
          { templateId: template.id, waitMinutes: 0 },
        ],
      },
      'req',
    )
    const contact = await app.clients.createContact(
      operator.actor,
      org.id,
      { name: 'Luz', phone: '+525512340000' },
      'req',
    )
    expect(await app.store.listRuns(automation.id)).toHaveLength(0)
    await app.clients.setConsent(operator.actor, org.id, contact.id, { smsConsent: true }, 'req')
    await app.drain()
    const runs = await app.automations.listRuns(operator.actor, org.id, automation.id)
    expect(runs[0]?.status).toBe('completed')
    expect(runs[0]?.steps.map((step) => step.status)).toEqual(['sent', 'sent'])
    expect(app.messages.sent.map((message) => message.body)).toEqual(['Hola Luz', 'Hola Luz'])

    app.messages.failuresRemaining = 3
    const manual = await app.automations.create(
      operator.actor,
      org.id,
      { name: 'Manual', trigger: 'manual', steps: [{ templateId: template.id, waitMinutes: 0 }] },
      'req',
    )
    await app.automations.startManual(operator.actor, org.id, manual.id, contact.id, 'req')
    await app.drain()
    current = new Date(current.getTime() + 61_000)
    await app.automations.processDue()
    await app.drain()
    current = new Date(current.getTime() + 121_000)
    await app.automations.processDue()
    await app.drain()
    const manualRuns = await app.automations.listRuns(operator.actor, org.id, manual.id)
    expect(manualRuns[0]?.status).toBe('failed')
    expect(manualRuns[0]?.attemptCount).toBe(3)
  })

  it('does not send after cancellation or without consent', async () => {
    const app = await createTestApp()
    const admin = await seedUser(app, {
      email: 'admin@test.local',
      password: 'admin-pass-1',
      role: 'platform_admin',
    })
    const org = await app.clients.createOrganization(admin.actor, { name: 'Cancelar' }, 'req')
    const operator = await seedUser(app, {
      email: 'op@test.local',
      password: 'operator-pass',
      role: 'operator',
      organizationId: org.id,
    })
    const template = await app.messaging.createTemplate(
      operator.actor,
      org.id,
      { name: 'Aviso', body: 'Hola {{name}}' },
      'req',
    )
    const automation = await app.automations.create(
      operator.actor,
      org.id,
      { name: 'Manual', trigger: 'manual', steps: [{ templateId: template.id, waitMinutes: 0 }] },
      'req',
    )
    const contact = await app.clients.createContact(
      operator.actor,
      org.id,
      { name: 'Luz', phone: '+525512340001' },
      'req',
    )
    await expect(
      app.automations.startManual(operator.actor, org.id, automation.id, contact.id, 'req'),
    ).rejects.toMatchObject({ status: 400 })
    await app.clients.setConsent(operator.actor, org.id, contact.id, { smsConsent: true }, 'req')
    const run = await app.automations.startManual(operator.actor, org.id, automation.id, contact.id, 'req')
    await app.automations.processDue()
    await app.automations.cancel(operator.actor, org.id, run.id, 'req')
    await app.drain()
    expect(app.messages.sent).toHaveLength(0)
    const steps = await app.store.listRunSteps(run.id)
    expect(steps.some((step) => step.status === 'skipped' || step.status === 'pending')).toBe(true)
  })
})
