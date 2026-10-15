import type {
  AssignmentRecord,
  AuditRecord,
  AutomationRecord,
  AutomationStepRecord,
  AutomationTriggerName,
  CallRecord,
  ContactRecord,
  ConversationRecord,
  InvitationRecord,
  MembershipRecord,
  MessageRecord,
  OrganizationRecord,
  OrgListQuery,
  RecordingRecord,
  Role,
  RunRecord,
  RunStepRecord,
  SessionRecord,
  TemplateRecord,
  UserListQuery,
  UserRecord,
} from './types'

type NewUser = Omit<UserRecord, 'createdAt' | 'updatedAt'>
type NewOrganization = Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>
type NewContact = Omit<ContactRecord, 'createdAt' | 'updatedAt'>
type NewConversation = Omit<ConversationRecord, 'createdAt' | 'updatedAt'>
type NewMessage = Omit<MessageRecord, 'createdAt' | 'updatedAt'>
type NewTemplate = Omit<TemplateRecord, 'createdAt' | 'updatedAt'>
type NewCall = Omit<CallRecord, 'createdAt' | 'updatedAt'>
type NewRecording = Omit<RecordingRecord, 'createdAt'>
type NewRun = Omit<RunRecord, 'createdAt' | 'updatedAt'>
type NewRunStep = Omit<RunStepRecord, 'createdAt'>
type NewAudit = Omit<AuditRecord, 'createdAt'>
type NewInvitation = Omit<InvitationRecord, 'createdAt' | 'acceptedAt'>
type NewMembership = Omit<MembershipRecord, 'createdAt'>
type NewAssignment = Omit<AssignmentRecord, 'createdAt'>

export interface Store {
  createUser(input: NewUser): Promise<UserRecord>
  findUserByEmail(email: string): Promise<UserRecord | null>
  findUserById(id: string): Promise<UserRecord | null>
  listUsers(query: UserListQuery): Promise<{ items: UserRecord[]; total: number }>

  createSession(input: SessionRecord): Promise<SessionRecord>
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  deleteSessionByTokenHash(tokenHash: string): Promise<void>

  createMembership(input: NewMembership): Promise<MembershipRecord>
  listMembershipsByUser(userId: string): Promise<MembershipRecord[]>
  findMembership(
    userId: string,
    organizationId: string | null,
    role: Role,
  ): Promise<MembershipRecord | null>

  createOrganization(input: NewOrganization): Promise<OrganizationRecord>
  updateOrganization(
    id: string,
    patch: Partial<Pick<OrganizationRecord, 'name' | 'active'>>,
  ): Promise<OrganizationRecord>
  findOrganizationById(id: string): Promise<OrganizationRecord | null>
  findOrganizationBySlug(slug: string): Promise<OrganizationRecord | null>
  listOrganizations(query: OrgListQuery): Promise<{ items: OrganizationRecord[]; total: number }>
  countOrganizations(query: { ids?: string[]; active?: boolean }): Promise<number>
  listOrganizationsByIds(ids: string[]): Promise<OrganizationRecord[]>

  createAssignment(input: NewAssignment): Promise<AssignmentRecord>
  deleteAssignment(operatorId: string, organizationId: string): Promise<void>
  listAssignmentsByOperator(operatorId: string): Promise<AssignmentRecord[]>
  listAssignmentsByOrganization(organizationId: string): Promise<AssignmentRecord[]>
  findAssignment(operatorId: string, organizationId: string): Promise<AssignmentRecord | null>

  createContact(input: NewContact): Promise<ContactRecord>
  updateContact(
    id: string,
    patch: Partial<Pick<ContactRecord, 'name' | 'phone' | 'smsConsent' | 'callConsent' | 'smsOptOut'>>,
  ): Promise<ContactRecord>
  findContactById(id: string): Promise<ContactRecord | null>
  findContactsByPhone(phone: string): Promise<ContactRecord[]>
  listContacts(query: {
    organizationId: string
    q?: string
    skip: number
    take: number
  }): Promise<{ items: ContactRecord[]; total: number }>

  createConversation(input: NewConversation): Promise<ConversationRecord>
  findConversationById(id: string): Promise<ConversationRecord | null>
  findConversationByContact(organizationId: string, contactId: string): Promise<ConversationRecord | null>
  touchConversation(id: string): Promise<void>
  listConversations(query: {
    organizationId: string
    skip: number
    take: number
  }): Promise<{ items: ConversationRecord[]; total: number }>
  countConversations(query: { organizationIds?: string[]; status?: 'open' | 'closed' }): Promise<number>

  createMessage(input: NewMessage): Promise<MessageRecord>
  updateMessage(
    id: string,
    patch: Partial<Pick<MessageRecord, 'status' | 'providerMessageId'>>,
  ): Promise<MessageRecord>
  findMessageById(id: string): Promise<MessageRecord | null>
  listMessages(conversationId: string): Promise<MessageRecord[]>

  createTemplate(input: NewTemplate): Promise<TemplateRecord>
  listTemplates(organizationId: string): Promise<TemplateRecord[]>
  findTemplate(id: string): Promise<TemplateRecord | null>

  createCall(input: NewCall): Promise<CallRecord>
  updateCall(
    id: string,
    patch: Partial<Pick<CallRecord, 'status' | 'providerCallId' | 'startedAt' | 'endedAt'>>,
  ): Promise<CallRecord>
  findCallById(id: string): Promise<CallRecord | null>
  findCallByProviderId(providerCallId: string): Promise<CallRecord | null>
  listCalls(query: {
    organizationId: string
    skip: number
    take: number
  }): Promise<{ items: CallRecord[]; total: number }>
  countCalls(query: { organizationIds?: string[]; createdAfter?: Date }): Promise<number>
  findActiveCallForOperator(operatorId: string): Promise<CallRecord | null>
  createRecording(input: NewRecording): Promise<RecordingRecord>
  listRecordingsByCall(callId: string): Promise<RecordingRecord[]>

  createAutomation(input: {
    id: string
    organizationId: string
    name: string
    trigger: AutomationTriggerName
    active: boolean
    steps: Array<Omit<AutomationStepRecord, 'automationId'>>
  }): Promise<AutomationRecord>
  listAutomations(organizationId: string): Promise<AutomationRecord[]>
  findAutomation(id: string): Promise<AutomationRecord | null>
  listActiveAutomations(
    organizationId: string,
    trigger: AutomationTriggerName,
  ): Promise<AutomationRecord[]>

  createRun(input: NewRun): Promise<RunRecord>
  updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, 'status' | 'currentStep' | 'nextRunAt' | 'attemptCount'>>,
  ): Promise<RunRecord>
  findRun(id: string): Promise<RunRecord | null>
  listRuns(automationId: string): Promise<RunRecord[]>
  listRunsForPair(automationId: string, contactId: string): Promise<RunRecord[]>
  listDueRuns(now: Date): Promise<RunRecord[]>
  createRunStep(input: NewRunStep): Promise<RunStepRecord>
  updateRunStep(
    id: string,
    patch: Partial<Pick<RunStepRecord, 'status' | 'providerMessageId' | 'error'>>,
  ): Promise<RunStepRecord>
  listRunSteps(runId: string): Promise<RunStepRecord[]>
  findRunStepByMessageId(messageId: string): Promise<RunStepRecord | null>
  findPendingRunStep(runId: string): Promise<RunStepRecord | null>

  createWebhookEvent(input: { id: string; provider: string; externalId: string }): Promise<boolean>
  deleteWebhookEvent(provider: string, externalId: string): Promise<void>
  createAuditLog(input: NewAudit): Promise<AuditRecord>
  createInvitation(input: NewInvitation): Promise<InvitationRecord>
  findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null>
  markInvitationAccepted(id: string, acceptedAt: Date): Promise<InvitationRecord>
}
