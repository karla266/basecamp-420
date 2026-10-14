import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8')

describe('prisma schema', () => {
  it('defines the mvp domain models', () => {
    const models = [...schema.matchAll(/^model (\w+)/gm)].map((match) => match[1])
    expect(models).toEqual(
      expect.arrayContaining([
        'User',
        'Session',
        'Organization',
        'Membership',
        'OperatorAssignment',
        'Contact',
        'Conversation',
        'Message',
        'MessageTemplate',
        'Call',
        'CallRecording',
        'Automation',
        'AutomationStep',
        'AutomationRun',
        'AutomationRunStep',
        'AuditLog',
        'WebhookEvent',
        'Invitation',
      ]),
    )
    expect(schema).toContain('provider = "postgresql"')
    expect(schema).not.toMatch(/Bytes/)
  })
})
