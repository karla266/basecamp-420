import { maskPhone } from './phone'

const BLOCKED = new Set([
  'body',
  'text',
  'phone',
  'to',
  'from',
  'password',
  'passwordhash',
  'token',
  'authorization',
  'cookie',
  'recordingurl',
  'secret',
  'authtoken',
  'setcookie',
])

const PHONE = /\+[1-9]\d{7,14}/g

function isBlocked(key: string): boolean {
  const normalized = key.toLowerCase()
  if (BLOCKED.has(normalized)) return true
  return (
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('phone')
  )
}

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (isBlocked(key)) continue
    if (typeof value === 'string') {
      safe[key] = value.replace(PHONE, (match) => maskPhone(match))
    } else if (value instanceof Date) {
      safe[key] = value.toISOString()
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      safe[key] = redact(value as Record<string, unknown>)
    } else {
      safe[key] = value
    }
  }
  return safe
}

export function formatLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    ...redact(fields),
    level,
    event,
    time: new Date().toISOString(),
  })
}
