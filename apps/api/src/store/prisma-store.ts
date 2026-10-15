import { Prisma, PrismaClient } from '@basecamp/db'
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
  OrgListQuery,
  RecordingRecord,
  RunRecord,
  RunStepRecord,
  SessionRecord,
  TemplateRecord,
  UserListQuery,
  UserRecord,
} from './types'

function asDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new DuplicateError()
  }
  throw error
}

function mapUser(user: {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}): UserRecord {
  return user
}

function mapAutomation(automation: {
  id: string
  organizationId: string
  name: string
  trigger: AutomationRecord['trigger']
  active: boolean
  createdAt: Date
  updatedAt: Date
  steps: AutomationStepRecord[]
}): AutomationRecord {
  return {
    ...automation,
    steps: [...automation.steps].sort((a, b) => a.position - b.position),
  }
}

export class PrismaStore implements Store {
  constructor(private readonly prisma: PrismaClient) {}

  async createUser(input: Omit<UserRecord, 'createdAt' | 'updatedAt'>): Promise<UserRecord> {
    try {
      return mapUser(await this.prisma.user.create({ data: input }))
    } catch (error) {
      return asDuplicate(error)
    }
  }

  findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } })
  }

  findUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } })
  }

  async listUsers(query: UserListQuery): Promise<{ items: UserRecord[]; total: number }> {
    if (query.organizationIds && query.organizationIds.length === 0) return { items: [], total: 0 }
    const where: Prisma.UserWhereInput = {
      AND: [
        query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {},
        query.organizationIds
          ? {
              OR: [
                {
                  memberships: {
                    some: {
                      organizationId: { in: query.organizationIds },
                      ...(query.role ? { role: query.role } : {}),
                    },
                  },
                },
                { assignments: { some: { organizationId: { in: query.organizationIds } } } },
              ],
            }
          : query.role
            ? { memberships: { some: { role: query.role } } }
            : {},
      ],
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ])
    return { items: items.map(mapUser), total }
  }

  createSession(input: SessionRecord): Promise<SessionRecord> {
    return this.prisma.session.create({ data: input })
  }

  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({ where: { tokenHash } })
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } })
  }

  async createMembership(input: Omit<MembershipRecord, 'createdAt'>): Promise<MembershipRecord> {
    try {
      const membership = await this.prisma.membership.create({ data: input })
      return membership
    } catch (error) {
      return asDuplicate(error)
    }
  }

  listMembershipsByUser(userId: string): Promise<MembershipRecord[]> {
    return this.prisma.membership.findMany({ where: { userId } })
  }

  findMembership(
    userId: string,
    organizationId: string | null,
    role: MembershipRecord['role'],
  ): Promise<MembershipRecord | null> {
    return this.prisma.membership.findFirst({ where: { userId, organizationId, role } })
  }

  async createOrganization(input: Omit<OrganizationRecord, 'createdAt' | 'updatedAt'>): Promise<OrganizationRecord> {
    try {
      return await this.prisma.organization.create({ data: input })
    } catch (error) {
      return asDuplicate(error)
    }
  }

  updateOrganization(
    id: string,
    patch: Partial<Pick<OrganizationRecord, 'name' | 'active'>>,
  ): Promise<OrganizationRecord> {
    return this.prisma.organization.update({ where: { id }, data: patch })
  }

  findOrganizationById(id: string): Promise<OrganizationRecord | null> {
    return this.prisma.organization.findUnique({ where: { id } })
  }

  findOrganizationBySlug(slug: string): Promise<OrganizationRecord | null> {
    return this.prisma.organization.findUnique({ where: { slug } })
  }

  async listOrganizations(query: OrgListQuery): Promise<{ items: OrganizationRecord[]; total: number }> {
    if (query.ids && query.ids.length === 0) return { items: [], total: 0 }
    const where: Prisma.OrganizationWhereInput = {
      ...(query.ids ? { id: { in: query.ids } } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organization.count({ where }),
    ])
    return { items, total }
  }

  countOrganizations(query: { ids?: string[]; active?: boolean }): Promise<number> {
    if (query.ids && query.ids.length === 0) return Promise.resolve(0)
    return this.prisma.organization.count({
      where: {
        ...(query.ids ? { id: { in: query.ids } } : {}),
        ...(query.active !== undefined ? { active: query.active } : {}),
      },
    })
  }

  listOrganizationsByIds(ids: string[]): Promise<OrganizationRecord[]> {
    if (ids.length === 0) return Promise.resolve([])
    return this.prisma.organization.findMany({ where: { id: { in: ids } } })
  }

  async createAssignment(input: Omit<AssignmentRecord, 'createdAt'>): Promise<AssignmentRecord> {
    try {
      return await this.prisma.operatorAssignment.create({ data: input })
    } catch (error) {
      return asDuplicate(error)
    }
  }

  async deleteAssignment(operatorId: string, organizationId: string): Promise<void> {
    await this.prisma.operatorAssignment.deleteMany({ where: { operatorId, organizationId } })
  }

  listAssignmentsByOperator(operatorId: string): Promise<AssignmentRecord[]> {
    return this.prisma.operatorAssignment.findMany({ where: { operatorId } })
  }

  listAssignmentsByOrganization(organizationId: string): Promise<AssignmentRecord[]> {
    return this.prisma.operatorAssignment.findMany({ where: { organizationId } })
  }

  findAssignment(operatorId: string, organizationId: string): Promise<AssignmentRecord | null> {
    return this.prisma.operatorAssignment.findUnique({
      where: { operatorId_organizationId: { operatorId, organizationId } },
    })
  }

  async createContact(input: Omit<ContactRecord, 'createdAt' | 'updatedAt'>): Promise<ContactRecord> {
    try {
      return await this.prisma.contact.create({ data: input })
    } catch (error) {
      return asDuplicate(error)
    }
  }

  async updateContact(
    id: string,
    patch: Partial<Pick<ContactRecord, 'name' | 'phone' | 'smsConsent' | 'callConsent' | 'smsOptOut'>>,
  ): Promise<ContactRecord> {
    try {
      return await this.prisma.contact.update({ where: { id }, data: patch })
    } catch (error) {
      return asDuplicate(error)
    }
  }

  findContactById(id: string): Promise<ContactRecord | null> {
    return this.prisma.contact.findUnique({ where: { id } })
  }

  findContactsByPhone(phone: string): Promise<ContactRecord[]> {
    return this.prisma.contact.findMany({ where: { phone } })
  }

  async listContacts(query: {
    organizationId: string
    q?: string
    skip: number
    take: number
  }): Promise<{ items: ContactRecord[]; total: number }> {
    const where: Prisma.ContactWhereInput = {
      organizationId: query.organizationId,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: 'desc' } }),
      this.prisma.contact.count({ where }),
    ])
    return { items, total }
  }

  createConversation(input: Omit<ConversationRecord, 'createdAt' | 'updatedAt'>): Promise<ConversationRecord> {
    return this.prisma.conversation.create({ data: input })
  }

  findConversationById(id: string): Promise<ConversationRecord | null> {
    return this.prisma.conversation.findUnique({ where: { id } })
  }

  findConversationByContact(organizationId: string, contactId: string): Promise<ConversationRecord | null> {
    return this.prisma.conversation.findUnique({
      where: { organizationId_contactId: { organizationId, contactId } },
    })
  }

  async touchConversation(id: string): Promise<void> {
    await this.prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } })
  }

  async listConversations(query: {
    organizationId: string
    skip: number
    take: number
  }): Promise<{ items: ConversationRecord[]; total: number }> {
    const where = { organizationId: query.organizationId }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.conversation.count({ where }),
    ])
    return { items, total }
  }

  countConversations(query: { organizationIds?: string[]; status?: 'open' | 'closed' }): Promise<number> {
    if (query.organizationIds && query.organizationIds.length === 0) return Promise.resolve(0)
    return this.prisma.conversation.count({
      where: {
        ...(query.organizationIds ? { organizationId: { in: query.organizationIds } } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
    })
  }

  async createMessage(input: Omit<MessageRecord, 'createdAt' | 'updatedAt'>): Promise<MessageRecord> {
    try {
      return await this.prisma.message.create({ data: input })
    } catch (error) {
      return asDuplicate(error)
    }
  }

  async updateMessage(
    id: string,
    patch: Partial<Pick<MessageRecord, 'status' | 'providerMessageId'>>,
  ): Promise<MessageRecord> {
    try {
      return await this.prisma.message.update({ where: { id }, data: patch })
    } catch (error) {
      return asDuplicate(error)
    }
  }

  findMessageById(id: string): Promise<MessageRecord | null> {
    return this.prisma.message.findUnique({ where: { id } })
  }

  listMessages(conversationId: string): Promise<MessageRecord[]> {
    return this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })
  }

  createTemplate(input: Omit<TemplateRecord, 'createdAt' | 'updatedAt'>): Promise<TemplateRecord> {
    return this.prisma.messageTemplate.create({ data: input })
  }

  listTemplates(organizationId: string): Promise<TemplateRecord[]> {
    return this.prisma.messageTemplate.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })
  }

  findTemplate(id: string): Promise<TemplateRecord | null> {
    return this.prisma.messageTemplate.findUnique({ where: { id } })
  }

  createCall(input: Omit<CallRecord, 'createdAt' | 'updatedAt'>): Promise<CallRecord> {
    return this.prisma.call.create({ data: input })
  }

  updateCall(
    id: string,
    patch: Partial<Pick<CallRecord, 'status' | 'providerCallId' | 'startedAt' | 'endedAt'>>,
  ): Promise<CallRecord> {
    return this.prisma.call.update({ where: { id }, data: patch })
  }

  findCallById(id: string): Promise<CallRecord | null> {
    return this.prisma.call.findUnique({ where: { id } })
  }

  findCallByProviderId(providerCallId: string): Promise<CallRecord | null> {
    return this.prisma.call.findUnique({ where: { providerCallId } })
  }

  async listCalls(query: {
    organizationId: string
    skip: number
    take: number
  }): Promise<{ items: CallRecord[]; total: number }> {
    const where = { organizationId: query.organizationId }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.call.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: 'desc' } }),
      this.prisma.call.count({ where }),
    ])
    return { items, total }
  }

  countCalls(query: { organizationIds?: string[]; createdAfter?: Date }): Promise<number> {
    if (query.organizationIds && query.organizationIds.length === 0) return Promise.resolve(0)
    return this.prisma.call.count({
      where: {
        ...(query.organizationIds ? { organizationId: { in: query.organizationIds } } : {}),
        ...(query.createdAfter ? { createdAt: { gte: query.createdAfter } } : {}),
      },
    })
  }

  findActiveCallForOperator(operatorId: string): Promise<CallRecord | null> {
    return this.prisma.call.findFirst({
      where: { operatorId, status: { in: ['placed', 'ringing', 'in_progress'] } },
    })
  }

  createRecording(input: Omit<RecordingRecord, 'createdAt'>): Promise<RecordingRecord> {
    return this.prisma.callRecording.create({ data: input })
  }

  listRecordingsByCall(callId: string): Promise<RecordingRecord[]> {
    return this.prisma.callRecording.findMany({ where: { callId }, orderBy: { createdAt: 'asc' } })
  }

  async createAutomation(input: {
    id: string
    organizationId: string
    name: string
    trigger: AutomationRecord['trigger']
    active: boolean
    steps: Array<Omit<AutomationStepRecord, 'automationId'>>
  }): Promise<AutomationRecord> {
    const created = await this.prisma.automation.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        name: input.name,
        trigger: input.trigger,
        active: input.active,
        steps: {
          create: input.steps.map((step) => ({
            id: step.id,
            position: step.position,
            templateId: step.templateId,
            waitMinutes: step.waitMinutes,
          })),
        },
      },
      include: { steps: true },
    })
    return mapAutomation(created)
  }

  async listAutomations(organizationId: string): Promise<AutomationRecord[]> {
    const rows = await this.prisma.automation.findMany({
      where: { organizationId },
      include: { steps: true },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(mapAutomation)
  }

  async findAutomation(id: string): Promise<AutomationRecord | null> {
    const row = await this.prisma.automation.findUnique({ where: { id }, include: { steps: true } })
    return row ? mapAutomation(row) : null
  }

  async listActiveAutomations(
    organizationId: string,
    trigger: AutomationRecord['trigger'],
  ): Promise<AutomationRecord[]> {
    const rows = await this.prisma.automation.findMany({
      where: { organizationId, trigger, active: true },
      include: { steps: true },
    })
    return rows.map(mapAutomation)
  }

  createRun(input: Omit<RunRecord, 'createdAt' | 'updatedAt'>): Promise<RunRecord> {
    return this.prisma.automationRun.create({ data: input })
  }

  updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, 'status' | 'currentStep' | 'nextRunAt' | 'attemptCount'>>,
  ): Promise<RunRecord> {
    return this.prisma.automationRun.update({ where: { id }, data: patch })
  }

  findRun(id: string): Promise<RunRecord | null> {
    return this.prisma.automationRun.findUnique({ where: { id } })
  }

  listRuns(automationId: string): Promise<RunRecord[]> {
    return this.prisma.automationRun.findMany({ where: { automationId }, orderBy: { createdAt: 'desc' } })
  }

  listRunsForPair(automationId: string, contactId: string): Promise<RunRecord[]> {
    return this.prisma.automationRun.findMany({ where: { automationId, contactId } })
  }

  listDueRuns(now: Date): Promise<RunRecord[]> {
    return this.prisma.automationRun.findMany({
      where: {
        status: 'running',
        nextRunAt: { lte: now },
        steps: { none: { status: 'pending' } },
      },
      orderBy: { nextRunAt: 'asc' },
      take: 50,
    })
  }

  createRunStep(input: Omit<RunStepRecord, 'createdAt'>): Promise<RunStepRecord> {
    return this.prisma.automationRunStep.create({ data: input })
  }

  updateRunStep(
    id: string,
    patch: Partial<Pick<RunStepRecord, 'status' | 'providerMessageId' | 'error'>>,
  ): Promise<RunStepRecord> {
    return this.prisma.automationRunStep.update({ where: { id }, data: patch })
  }

  listRunSteps(runId: string): Promise<RunStepRecord[]> {
    return this.prisma.automationRunStep.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } })
  }

  findRunStepByMessageId(messageId: string): Promise<RunStepRecord | null> {
    return this.prisma.automationRunStep.findFirst({ where: { messageId } })
  }

  findPendingRunStep(runId: string): Promise<RunStepRecord | null> {
    return this.prisma.automationRunStep.findFirst({ where: { runId, status: 'pending' } })
  }

  async createWebhookEvent(input: { id: string; provider: string; externalId: string }): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({ data: input })
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
      throw error
    }
  }

  async deleteWebhookEvent(provider: string, externalId: string): Promise<void> {
    await this.prisma.webhookEvent.deleteMany({ where: { provider, externalId } })
  }

  createAuditLog(input: Omit<AuditRecord, 'createdAt'>): Promise<AuditRecord> {
    return this.prisma.auditLog.create({ data: input })
  }

  async createInvitation(input: Omit<InvitationRecord, 'createdAt' | 'acceptedAt'>): Promise<InvitationRecord> {
    const invitation = await this.prisma.invitation.create({ data: input })
    return invitation
  }

  findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    return this.prisma.invitation.findUnique({ where: { tokenHash } })
  }

  markInvitationAccepted(id: string, acceptedAt: Date): Promise<InvitationRecord> {
    return this.prisma.invitation.update({ where: { id }, data: { acceptedAt } })
  }
}
