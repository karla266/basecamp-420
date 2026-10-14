import { describe, expect, it } from 'vitest'
import { FakeMessageGateway, FakeVoiceGateway } from './fake/fake-gateways'
import { computeTwilioSignature, validateTwilioSignature } from './twilio/signature'

describe('twilio signature', () => {
  it('accepts a signature for the same url and params and rejects tampering', () => {
    const token = 'test-auth-token'
    const url = 'http://localhost:3001/webhooks/twilio/sms'
    const params = { Body: 'Hola', From: '+525512345678', MessageSid: 'SM1', To: '+15005550006' }
    const signature = computeTwilioSignature(token, url, params)
    expect(validateTwilioSignature(token, url, params, signature)).toBe(true)
    expect(validateTwilioSignature(token, url, { ...params, Body: 'Otro' }, signature)).toBe(false)
    expect(validateTwilioSignature(token, url, params, undefined)).toBe(false)
  })
})

describe('fake adapters', () => {
  it('records an sms and a call status cycle without storing audio bytes', async () => {
    const messages = new FakeMessageGateway()
    const sent = await messages.sendSms({ to: '+525500000000', from: '+15005550006', body: 'Hola' })
    expect(sent.providerMessageId).toBe('SM1')
    expect(messages.sent).toHaveLength(1)

    const voice = new FakeVoiceGateway()
    const call = await voice.placeCall({ to: '+525500000000', from: '+15005550006' })
    const cycle = voice.statusSequence(call.providerCallId).map((event) => event.callStatus)
    expect(cycle).toEqual(['ringing', 'in-progress', 'completed'])
    const completed = voice.statusSequence(call.providerCallId)[2]
    expect(completed?.recordingSid).toBe(`RE${call.providerCallId}`)
    expect(JSON.stringify(completed)).not.toContain('base64')
  })
})
