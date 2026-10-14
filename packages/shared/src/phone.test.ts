import { describe, expect, it } from 'vitest'
import { isE164, maskPhone } from './phone'

describe('phone numbers', () => {
  it('accepts E.164 and rejects local formats', () => {
    expect(isE164('+525512345678')).toBe(true)
    expect(isE164('+15005550006')).toBe(true)
    expect(isE164('5512345678')).toBe(false)
    expect(isE164('+0123')).toBe(false)
  })

  it('masks all but the last four digits', () => {
    expect(maskPhone('+525512345678')).toBe('***5678')
    expect(maskPhone('+525512345678')).not.toContain('551234')
  })
})
