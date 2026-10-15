import { DuplicateError } from '../errors'
import type { Store } from './store'
import type {
  AssignmentRecord,
  AuditRecord,
  AutomationRecord,
  AutomationStepRecord,
  CallRecord,
  ContactRecord,
  ConversationRecord,
  InvitationRecord,
  MembershipRecord,
  MessageRecord,
  OrganizationRecord,
  RecordingRecord,
  RunRecord,
  RunStepRecord,
  SessionRecord,
  TemplateRecord,
  UserRecord,
} from './types'

function includesQuery(q: string | undefined, values: string[]): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return values.some((value) => value.toLowerCase().includes(needle))
}

function slicePage<T>(items: T[], skip: number, take: number): { items: T[]; total: number } {
  return { items: items.slice(skip, skip + take), total: items.length }
}

export class MemoryStore implements Store {
  users: UserRecord[] = []
  sessions: SessionRecord[] = []
  organizations: OrganizationRecord[] = []
  memberships: MembershipRecord[] = []
  assignments: AssignmentRecord[] = []
  contacts: ContactRecord[] = []
  conversations: ConversationRecord[] = []
  messages: MessageRecord[] = []
  templates: TemplateRecord[] = []
  calls: CallRecord[] = []
  recordings: RecordingRecord[] = []
  automations: AutomationRecord[] = []
  runs: RunRecord[] = []
  runSteps: RunStepRecord[] = []
  audits: AuditRecord[] = []
  webhookKeys = new Set<string>()
  invitations: InvitationRecord[] = []

  async createUser(input: Omit<UserRecord, 'createdAt' | 'updatedAt'>): Promise<UserRecord> {
    if (this.users.some((user) => user.email === input.email)) throw new DuplicateError()
    const now = new Date()
    const user = { ...input, createdAt: now, updatedAt: now }
    this.users.push(user)
    return user
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.email === email) ?? null
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.id === id) ?? null
  }

  async listUsers(query: {
    q?: string
    role?: MembershipRecord['role']
    organizationIds?: string[]
    skip: number
    take: number
  }): Promise<{ items: UserRecord[]; total: number }> {
    const items = this.users.filter((user) => {
      if (!includesQuery(query.q, [user.name, user.email])) return false
      if (query.organizationIds) {
        const member = this.memberships.some(
          (membership) =>
            membership.userId === user.id &&
            membership.organizationId !== null &&
            query.organizationIds?.includes(membership.organizationId) &&
            (!query.role || membership.role === query.role),
        )
        const assigned = this.assignments.some(
          (assignment) =>
            assignment.operatorId === user.id && query.organizationIds?.includes(assignment.organizationId),
        )
        return member || assigned
      }
      if (query.role) {
        return this.memberships.some(
          (membership) => membership.userId === user.id && membership.role === query.role,
        )
      }
      return true
    })
    return slicePage(items, query.skip, query.take)
  }

  async createSession(input: SessionRecord): Promise<SessionRecord> {
    this.sessions.push(input)
    return input
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.sessions.find((session) => session.tokenHash === tokenHash) ?? null
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    this.sessions = this.sessions.filter((session) => session.tokenHash !== tokenHash)
  }

  async createMembership(input: Omit<MembershipRecord, 'createdAt'>): Promise<MembershipRecord> {
    const existing = await this.findMembership(input.userId, input.organizationId, input.role)
    if (existing) throw new DuplicateError()
    const membership = { ...input, createdAt: new Date() }
    this.memberships.push(membership)
    return membership
  }

  async listMembershipsByUser(userId: string): Promise<MembershipRecord[]> {
    return this.memberships.filter((membership) => membership.userId === userId)
  }

  async findMembership(
    userId: string,
    organizationId: string | null,
    role: MembershipRecord['role'],
  ): Promise<MembershipRecord | null> {
    return (
      this.memberships.find(
        (membership) =>
          membership.userId === userId &&
          membership.organizationId === organizationId &&
          membership.role === role,
      ) ?? null
    )
  }

  async createOrganization(input: Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>): Promise<OrganizationRecord> {
    if (this.organizations.some((organization) => organization.slug === input.slug)) throw new DuplicateError()
    const now = new Date()
    const organization = { ...input, createdAt: now, updatedAt: now }
    this.organizations.push(organization)
    return organization
  }

  async updateOrganization(
    id: string,
    patch: Partial<Pick<OrganizationRecord, 'name' | 'active'>>,
  ): Promise<OrganizationRecord> {
    const organization = this.requireOrg(id)
    Object.assign(organization, patch, { updatedAt: new Date() })
    return organization
  }

  async findOrganizationById(id: string): Promise<OrganizationRecord | null> {
    return this.organizations.find((organization) => organization.id === id) ?? null
  }

  async findOrganizationBySlug(slug: string): Promise<OrganizationRecord | null> {
    return this.organizations.find((organization) => organization.slug === slug) ?? null
  }

  async listOrganizations(query: {
    ids?: string[]
    q?: string
    active?: boolean
    skip: number
    take: number
  }): Promise<{ items: OrganizationRecord[]; total: number }> {
    if (query.ids && query.ids.length === 0) return { items: [], total: 0 }
    const items = this.organizations
      .filter((organization) => (query.ids ? query.ids.includes(organization.id) : true))
      .filter((organization) => (query.active === undefined ? true : organization.active === query.active))
      .filter((organization) => includesQuery(query.q, [organization.name, organization.slug]))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return slicePage(items, query.skip, query.take)
  }

  async countOrganizations(query: { ids?: string[]; active?: boolean }): Promise<number> {
    if (query.ids && query.ids.length === 0) return 0
    return this.organizations.filter((organization) => {
      if (query.ids && !query.ids.includes(organization.id)) return false
      if (query.active !== undefined && organization.active !== query.active) return false
      return true
    }).length
  }

  async listOrganizationsByIds(ids: string[]): Promise<OrganizationRecord[]> {
    return this.organizations.filter((organization) => ids.includes(organization.id))
  }

  async createAssignment(input: Omit<AssignmentRecord, 'createdAt'>): Promise<AssignmentRecord> {
    if (await this.findAssignment(input.operatorId, input.organizationId)) throw new DuplicateError()
    const assignment = { ...input, createdAt: new Date() }
    this.assignments.push(assignment)
    return assignment
  }

  async deleteAssignment(operatorId: string, organizationId: string): Promise<void> {
    this.assignments = this.assignments.filter(
      (assignment) =>
        !(assignment.operatorId === operatorId && assignment.organizationId === organizationId),
    )
  }

  async listAssignmentsByOperator(operatorId: string): Promise<AssignmentRecord[]> {
    return this.assignments.filter((assignment) => assignment.operatorId === operatorId)
  }

  async listAssignmentsByOrganization(organizationId: string): Promise<AssignmentRecord[]> {
    return this.assignments.filter((assignment) => assignment.organizationId === organizationId)
  }

  async findAssignment(operatorId: string, organizationId: string): Promise<AssignmentRecord | null> {
    return (
      this.assignments.find(
        (assignment) =>
          assignment.operatorId === operatorId && assignment.organizationId === organizationId,
      ) ?? null
    )
  }

  async createContact(input: Omit<ContactRecord, 'createdAt' | 'updatedAt'>): Promise<ContactRecord> {
    if (this.contacts.some((contact) => contact.organizationId === input.organizationId && contact.phone === input.phone)) {
      throw new DuplicateError()
    }
    const now = new Date()
    const contact = { ...input, createdAt: now, updatedAt: now }
    this.contacts.push(contact)
    return contact
  }

  async updateContact(
    id: string,
    patch: Partial<Pick<ContactRecord, 'name' | 'phone' | 'smsConsent' | 'callConsent' | 'smsOptOut'>>,
  ): Promise<ContactRecord> {
    const contact = this.requireContact(id)
    if (patch.phone && patch.phone !== contact.phone) {
      const clash = this.contacts.some(
        (item) => item.organizationId === contact.organizationId && item.phone === patch.phone && item.id !== id,
      )
      if (clash) throw new DuplicateError()
    }
    Object.assign(contact, patch, { updatedAt: new Date() })
    return contact
  }

  async findContactById(id: string): Promise<ContactRecord | null> {
    return this.contacts.find((contact) => contact.id === id) ?? null
  }

  async findContactsByPhone(phone: string): Promise<ContactRecord[]> {
    return this.contacts.filter((contact) => contact.phone === phone)
  }

  async listContacts(query: {
    organizationId: string
    q?: string
    skip: number
    take: number
  }): Promise<{ items: ContactRecord[]; total: number }> {
    const items = this.contacts
      .filter((contact) => contact.organizationId === query.organizationId)
      .filter((contact) => includesQuery(query.q, [contact.name, contact.phone]))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return slicePage(items, query.skip, query.take)
  }

  async createConversation(
    input: Omit<ConversationRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<ConversationRecord> {
    const now = new Date()
    const conversation = { ...input, createdAt: now, updatedAt: now }
    this.conversations.push(conversation)
    return conversation
  }

  async findConversationById(id: string): Promise<ConversationRecord | null> {
    return this.conversations.find((conversation) => conversation.id === id) ?? null
  }

  async findConversationByContact(
    organizationId: string,
    contactId: string,
  ): Promise<ConversationRecord | null> {
    return (
      this.conversations.find(
        (conversation) =>
          conversation.organizationId === organizationId && conversation.contactId === contactId,
      ) ?? null
    )
  }

  async touchConversation(id: string): Promise<void> {
    const conversation = this.conversations.find((item) => item.id === id)
    if (conversation) conversation.updatedAt = new Date()
  }

  async listConversations(query: {
    organizationId: string
    skip: number
    take: number
  }): Promise<{ items: ConversationRecord[]; total: number }> {
    const items = this.conversations
      .filter((conversation) => conversation.organizationId === query.organizationId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    return slicePage(items, query.skip, query.take)
  }

  async countConversations(query: {
    organizationIds?: string[]
    status?: 'open' | 'closed'
  }): Promise<number> {
    if (query.organizationIds && query.organizationIds.length === 0) return 0
    return this.conversations.filter((conversation) => {
      if (query.organizationIds && !query.organizationIds.includes(conversation.organizationId)) return false
      if (query.status && conversation.status !== query.status) return false
      return true
    }).length
  }

  async createMessage(input: Omit<MessageRecord, 'createdAt' | 'updatedAt'>): Promise<MessageRecord> {
    if (
      input.providerMessageId &&
      this.messages.some((message) => message.providerMessageId === input.providerMessageId)
    ) {
      throw new DuplicateError()
    }
    const now = new Date()
    const message = { ...input, createdAt: now, updatedAt: now }
    this.messages.push(message)
    return message
  }

  async updateMessage(
    id: string,
    patch: Partial<Pick<MessageRecord, 'status' | 'providerMessageId'>>,
  ): Promise<MessageRecord> {
    const message = this.messages.find((item) => item.id === id)
    if (!message) throw new Error('message missing')
    if (
      patch.providerMessageId &&
      this.messages.some((item) => item.providerMessageId === patch.providerMessageId && item.id !== id)
    ) {
      throw new DuplicateError()
    }
    Object.assign(message, patch, { updatedAt: new Date() })
    return message
  }

  async findMessageById(id: string): Promise<MessageRecord | null> {
    return this.messages.find((message) => message.id === id) ?? null
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    return this.messages
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async createTemplate(input: Omit<TemplateRecord, 'createdAt' | 'updatedAt'>): Promise<TemplateRecord> {
    const now = new Date()
    const template = { ...input, createdAt: now, updatedAt: now }
    this.templates.push(template)
    return template
  }

  async listTemplates(organizationId: string): Promise<TemplateRecord[]> {
    return this.templates.filter((template) => template.organizationId === organizationId)
  }

  async findTemplate(id: string): Promise<TemplateRecord | null> {
    return this.templates.find((template) => template.id === id) ?? null
  }

  async createCall(input: Omit<CallRecord, 'createdAt' | 'updatedAt'>): Promise<CallRecord> {
    const now = new Date()
    const call = { ...input, createdAt: now, updatedAt: now }
    this.calls.push(call)
    return call
  }

  async updateCall(
    id: string,
    patch: Partial<Pick<CallRecord, 'status' | 'providerCallId' | 'startedAt' | 'endedAt'>>,
  ): Promise<CallRecord> {
    const call = this.calls.find((item) => item.id === id)
    if (!call) throw new Error('call missing')
    Object.assign(call, patch, { updatedAt: new Date() })
    return call
  }

  async findCallById(id: string): Promise<CallRecord | null> {
    return this.calls.find((call) => call.id === id) ?? null
  }

  async findCallByProviderId(providerCallId: string): Promise<CallRecord | null> {
    return this.calls.find((call) => call.providerCallId === providerCallId) ?? null
  }

  async listCalls(query: {
    organizationId: string
    skip: number
    take: number
  }): Promise<{ items: CallRecord[]; total: number }> {
    const items = this.calls
      .filter((call) => call.organizationId === query.organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return slicePage(items, query.skip, query.take)
  }

  async countCalls(query: { organizationIds?: string[]; createdAfter?: Date }): Promise<number> {
    if (query.organizationIds && query.organizationIds.length === 0) return 0
    return this.calls.filter((call) => {
      if (query.organizationIds && !query.organizationIds.includes(call.organizationId)) return false
      if (query.createdAfter && call.createdAt < query.createdAfter) return false
      return true
    }).length
  }

  async findActiveCallForOperator(operatorId: string): Promise<CallRecord | null> {
    return (
      this.calls.find(
        (call) =>
          call.operatorId === operatorId &&
          (call.status === 'placed' || call.status === 'ringing' || call.status === 'in_progress'),
      ) ?? null
    )
  }

  async createRecording(input: Omit<RecordingRecord, 'createdAt'>): Promise<RecordingRecord> {
    const recording = { ...input, createdAt: new Date() }
    this.recordings.push(recording)
    return recording
  }

  async listRecordingsByCall(callId: string): Promise<RecordingRecord[]> {
    return this.recordings.filter((recording) => recording.callId === callId)
  }

  async createAutomation(input: {
    id: string
    organizationId: string
    name: string
    trigger: AutomationRecord['trigger']
    active: boolean
    steps: Array<Omit<AutomationStepRecord, 'automationId'>>
  }): Promise<AutomationRecord> {
    const now = new Date()
    const automation: AutomationRecord = {
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      trigger: input.trigger,
      active: input.active,
      createdAt: now,
      updatedAt: now,
      steps: input.steps.map((step) => ({ ...step, automationId: input.id })),
    }
    this.automations.push(automation)
    return automation
  }

  async listAutomations(organizationId: string): Promise<AutomationRecord[]> {
    return this.automations.filter((automation) => automation.organizationId === organizationId)
  }

  async findAutomation(id: string): Promise<AutomationRecord | null> {
    return this.automations.find((automation) => automation.id === id) ?? null
  }

  async listActiveAutomations(
    organizationId: string,
    trigger: AutomationRecord['trigger'],
  ): Promise<AutomationRecord[]> {
    return this.automations.filter(
      (automation) =>
        automation.organizationId === organizationId && automation.trigger === trigger && automation.active,
    )
  }

  async createRun(input: Omit<RunRecord, 'createdAt' | 'updatedAt'>): Promise<RunRecord> {
    const now = new Date()
    const run = { ...input, createdAt: now, updatedAt: now }
    this.runs.push(run)
    return run
  }

  async updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, 'status' | 'currentStep' | 'nextRunAt' | 'attemptCount'>>,
  ): Promise<RunRecord> {
    const run = this.runs.find((item) => item.id === id)
    if (!run) throw new Error('run missing')
    Object.assign(run, patch, { updatedAt: new Date() })
    return run
  }

  async findRun(id: string): Promise<RunRecord | null> {
    return this.runs.find((run) => run.id === id) ?? null
  }

  async listRuns(automationId: string): Promise<RunRecord[]> {
    return this.runs
      .filter((run) => run.automationId === automationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  async listRunsForPair(automationId: string, contactId: string): Promise<RunRecord[]> {
    return this.runs.filter((run) => run.automationId === automationId && run.contactId === contactId)
  }

  async listDueRuns(now: Date): Promise<RunRecord[]> {
    return this.runs.filter((run) => {
      if (run.status !== 'running' || !run.nextRunAt || run.nextRunAt.getTime() > now.getTime()) return false
      return !this.runSteps.some((step) => step.runId === run.id && step.status === 'pending')
    })
  }

  async createRunStep(input: Omit<RunStepRecord, 'createdAt'>): Promise<RunStepRecord> {
    const step = { ...input, createdAt: new Date() }
    this.runSteps.push(step)
    return step
  }

  async updateRunStep(
    id: string,
    patch: Partial<Pick<RunStepRecord, 'status' | 'providerMessageId' | 'error'>>,
  ): Promise<RunStepRecord> {
    const step = this.runSteps.find((item) => item.id === id)
    if (!step) throw new Error('run step missing')
    Object.assign(step, patch)
    return step
  }

  async listRunSteps(runId: string): Promise<RunStepRecord[]> {
    return this.runSteps
      .filter((step) => step.runId === runId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async findRunStepByMessageId(messageId: string): Promise<RunStepRecord | null> {
    return this.runSteps.find((step) => step.messageId === messageId) ?? null
  }

  async findPendingRunStep(runId: string): Promise<RunStepRecord | null> {
    return this.runSteps.find((step) => step.runId === runId && step.status === 'pending') ?? null
  }

  async createWebhookEvent(input: { id: string; provider: string; externalId: string }): Promise<boolean> {
    const key = `${input.provider}:${input.externalId}`
    if (this.webhookKeys.has(key)) return false
    this.webhookKeys.add(key)
    return true
  }

  async deleteWebhookEvent(provider: string, externalId: string): Promise<void> {
    this.webhookKeys.delete(`${provider}:${externalId}`)
  }

  async createAuditLog(input: Omit<AuditRecord, 'createdAt'>): Promise<AuditRecord> {
    const audit = { ...input, createdAt: new Date() }
    this.audits.push(audit)
    return audit
  }

  async createInvitation(input: Omit<InvitationRecord, 'createdAt' | 'acceptedAt'>): Promise<InvitationRecord> {
    const invitation = { ...input, acceptedAt: null, createdAt: new Date() }
    this.invitations.push(invitation)
    return invitation
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    return this.invitations.find((invitation) => invitation.tokenHash === tokenHash) ?? null
  }

  async markInvitationAccepted(id: string, acceptedAt: Date): Promise<InvitationRecord> {
    const invitation = this.invitations.find((item) => item.id === id)
    if (!invitation) throw new Error('invitation missing')
    invitation.acceptedAt = acceptedAt
    return invitation
  }

  private requireOrg(id: string): OrganizationRecord {
    const organization = this.organizations.find((item) => item.id === id)
    if (!organization) throw new Error('organization missing')
    return organization
  }

  private requireContact(id: string): ContactRecord {
    const contact = this.contacts.find((item) => item.id === id)
    if (!contact) throw new Error('contact missing')
    return contact
  }
}
