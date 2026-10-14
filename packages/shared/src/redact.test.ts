import { describe, expect, it } from 'vitest'
import { formatLog } from './redact'

describe('log redaction', () => {
  it('keeps organization and request ids and drops message content and full numbers', () => {
    const line = formatLog('info', 'message.sent', {
      organizationId: 'org-1',
      requestId: 'req-1',
      messageId: 'msg-1',
      body: 'CodigoSecreto123',
      to: '+525512345678',
      from: '+15005550006',
      password: 'super-secret',
      token: 'session-token',
      note: 'llamada a +525512345678 lista',
    })
    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed.level).toBe('info')
    expect(parsed.organizationId).toBe('org-1')
    expect(parsed.requestId).toBe('req-1')
    expect(parsed.messageId).toBe('msg-1')
    expect(parsed.body).toBeUndefined()
    expect(parsed.to).toBeUndefined()
    expect(parsed.password).toBeUndefined()
    expect(parsed.token).toBeUndefined()
    expect(line).not.toContain('CodigoSecreto123')
    expect(line).not.toContain('525512345678')
    expect(line).not.toContain('super-secret')
    expect(line).not.toContain('session-token')
    expect(parsed.note).toBe('llamada a ***5678 lista')
  })
})
