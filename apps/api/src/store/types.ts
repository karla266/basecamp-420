export type { Role } from '@basecamp/shared'
import type { Role } from '@basecamp/shared'

export type UserRecord = {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

export type SessionRecord = {
  id: string
  tokenHash: string
  userId: string
  expiresAt: Date
  createdAt: Date
}

export type OrganizationRecord = {
  id: string
  name: string
  slug: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export type MembershipRecord = {
  id: string
  userId: string
  organizationId: string | null
  role: Role
  createdAt: Date
}

export type AssignmentRecord = {
  id: string
  operatorId: string
  organizationId: string
  createdAt: Date
}

export type ContactRecord = {
  id: string
  organizationId: string
  name: string
  phone: string
  smsConsent: boolean
  callConsent: boolean
  smsOptOut: boolean
  createdAt: Date
  updatedAt: Date
}

export type ConversationRecord = {
  id: string
  organizationId: string
  contactId: string
  status: 'open' | 'closed'
  createdAt: Date
  updatedAt: Date
}

export type MessageRecord = {
  id: string
  organizationId: string
  conversationId: string
  contactId: string
  direction: 'inbound' | 'outbound'
  body: string
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'received'
  providerMessageId: string | null
  createdAt: Date
  updatedAt: Date
}

export type TemplateRecord = {
  id: string
  organizationId: string
  name: string
  body: string
  createdAt: Date
  updatedAt: Date
}

export type CallStatusName = 'placed' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'canceled'

export type CallRecord = {
  id: string
  organizationId: string
  contactId: string
  operatorId: string
  status: CallStatusName
  providerCallId: string | null
  fromNumber: string
  toNumber: string
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type RecordingRecord = {
  id: string
  callId: string
  organizationId: string
  storageKey: string
  url: string
  contentType: string
  durationSeconds: number | null
  createdAt: Date
}

export type AutomationTriggerName = 'contact_created' | 'manual'
export type RunStatusName = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type RunStepStatusName = 'pending' | 'sent' | 'failed' | 'skipped'

export type AutomationStepRecord = {
  id: string
  automationId: string
  position: number
  templateId: string
  waitMinutes: number
}

export type AutomationRecord = {
  id: string
  organizationId: string
  name: string
  trigger: AutomationTriggerName
  active: boolean
  createdAt: Date
  updatedAt: Date
  steps: AutomationStepRecord[]
}

export type RunRecord = {
  id: string
  automationId: string
  contactId: string
  organizationId: string
  status: RunStatusName
  currentStep: number
  nextRunAt: Date | null
  attemptCount: number
  createdAt: Date
  updatedAt: Date
}

export type RunStepRecord = {
  id: string
  runId: string
  stepId: string
  messageId: string | null
  status: RunStepStatusName
  providerMessageId: string | null
  error: string | null
  createdAt: Date
}

export type AuditRecord = {
  id: string
  actorId: string | null
  organizationId: string | null
  action: string
  entityType: string
  entityId: string
  requestId: string | null
  createdAt: Date
}

export type InvitationRecord = {
  id: string
  email: string
  organizationId: string | null
  role: Role
  tokenHash: string
  invitedById: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

export type UserListQuery = {
  q?: string
  role?: Role
  organizationIds?: string[]
  skip: number
  take: number
}

export type OrgListQuery = {
  ids?: string[]
  q?: string
  active?: boolean
  skip: number
  take: number
}
