import { describe, expect, it } from 'vitest'
import { createTestApp, seedUser } from '../testing/create-test-app'

describe('calls', () => {
  it('completes one outbound call and stores recording metadata', async () => {
    const app = await createTestApp()
    const admin = await seedUser(app, {
      email: 'admin@test.local',
      password: 'admin-pass-1',
      role: 'platform_admin',
    })
    const org = await app.clients.createOrganization(admin.actor, { name: 'Voz' }, 'req')
    const operator = await seedUser(app, {
      email: 'op@test.local',
      password: 'operator-pass',
      role: 'operator',
      organizationId: org.id,
    })
    const contact = await app.clients.createContact(
      operator.actor,
      org.id,
      { name: 'Ana', phone: '+525512349999' },
      'req',
    )
    await expect(app.calls.place(operator.actor, org.id, contact.id, 'req')).rejects.toMatchObject({
      status: 400,
    })
    await app.clients.setConsent(operator.actor, org.id, contact.id, { callConsent: true }, 'req')
    const call = await app.calls.place(operator.actor, org.id, contact.id, 'req')
    await expect(app.calls.place(operator.actor, org.id, contact.id, 'req')).rejects.toMatchObject({
      status: 409,
    })
    await app.drain()
    const placed = app.voice.placed[0]
    expect(placed?.providerCallId).toBeTruthy()
    for (const event of app.voice.statusSequence(placed?.providerCallId ?? '')) {
      await app.calls.acceptStatusWebhook({
        callSid: placed?.providerCallId ?? '',
        callStatus: event.callStatus,
        recordingUrl: event.recordingUrl,
        recordingSid: event.recordingSid,
        recordingDuration: event.recordingDuration,
      })
    }
    await app.drain()
    const detail = await app.calls.get(operator.actor, org.id, call.id)
    expect(detail.status).toBe('completed')
    expect(detail.recordings).toHaveLength(1)
    expect(detail.recordings[0]?.storageKey).toContain('recordings/')
    expect(detail.recordings[0]?.url).toBeTruthy()
    expect(detail.recordings[0]).not.toHaveProperty('bytes')
    expect(JSON.stringify(app.storage.objects)).not.toContain('base64')
    const replay = await app.calls.acceptStatusWebhook({
      callSid: placed?.providerCallId ?? '',
      callStatus: 'completed',
      recordingSid: `RE${placed?.providerCallId}`,
      recordingUrl: 'https://recordings.example/again',
    })
    expect(replay.duplicate).toBe(true)
  })
})
