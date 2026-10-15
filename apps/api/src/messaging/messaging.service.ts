import { randomUUID } from 'node:crypto'
import type { MessageGateway } from '@basecamp/comms'
import { pageQuery, type Actor } from '@basecamp/shared'
import { writeAudit } from '../audit/audit'
import { DuplicateError, Errors } from '../errors'
import type { Logger } from '../logging/logger'
import type { JobEnqueuer } from '../queue/queue'
import type { RateLimiter } from '../rate-limit/rate-limiter'
import type { Store } from '../store/store'
import type { ContactRecord, MessageRecord } from '../store/types'
import { assertOperate, assertOrganizationAccess } from '../tenancy/access'

export type OutboundSettlement = {
  messageId: string
  organizationId: string
  status: 'sent' | 'failed'
  providerMessageId?: string
  requestId?: string
}

export class MessagingService {
  private onSettled: (event: OutboundSettlement) => Promise<void> = async () => undefined

  constructor(
    private readonly store: Store,
    private readonly gateway: MessageGateway,
    private readonly queue: JobEnqueuer,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: Logger,
    private readonly fromNumber: string,
  ) {}

  setOutboundHandler(handler: (event: OutboundSettlement) => Promise<void>): void {
    this.onSettled = handler
  }

  async createTemplate(
    actor: Actor,
    organizationId: string,
    input: { name: string; body: string },
    requestId?: string,
  ) {
    assertOperate(actor, organizationId)
    const template = await this.store.createTemplate({
      id: randomUUID(),
      organizationId,
      name: input.name.trim(),
      body: input.body.trim(),
    })
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'template.created',
      entityType: 'message_template',
      entityId: template.id,
      requestId,
    })
    return template
  }

  async listTemplates(actor: Actor, organizationId: string) {
    assertOrganizationAccess(actor, organizationId)
    return this.store.listTemplates(organizationId)
  }

  async listConversations(
    actor: Actor,
    organizationId: string,
    query: { page?: number; pageSize?: number },
  ) {
    assertOrganizationAccess(actor, organizationId)
    const page = pageQuery(query)
    const result = await this.store.listConversations({
      organizationId,
      skip: page.skip,
      take: page.pageSize,
    })
    const items = await Promise.all(
      result.items.map(async (conversation) => {
        const contact = await this.store.findContactById(conversation.contactId)
        return {
          ...conversation,
          contactName: contact?.name ?? 'Contacto',
          contactPhone: contact?.phone ?? '',
        }
      }),
    )
    return { ...result, items, page: page.page, pageSize: page.pageSize }
  }

  async getConversation(actor: Actor, organizationId: string, conversationId: string) {
    assertOrganizationAccess(actor, organizationId)
    const conversation = await this.store.findConversationById(conversationId)
    if (!conversation || conversation.organizationId !== organizationId) {
      throw Errors.notFound('Conversación')
    }
    const contact = await this.store.findContactById(conversation.contactId)
    const messages = await this.store.listMessages(conversation.id)
    return {
      ...conversation,
      contactName: contact?.name ?? 'Contacto',
      contactPhone: contact?.phone ?? '',
      messages,
    }
  }

  async sendManual(
    actor: Actor,
    organizationId: string,
    input: { contactId: string; body: string },
    requestId?: string,
  ): Promise<MessageRecord> {
    assertOperate(actor, organizationId)
    return this.queueOutbound({
      organizationId,
      contactId: input.contactId,
      body: input.body.trim(),
      requestId,
      actorId: actor.userId,
    })
  }

  async queueOutbound(input: {
    organizationId: string
    contactId: string
    body: string
    requestId?: string
    actorId?: string | null
  }): Promise<MessageRecord> {
    const contact = await this.store.findContactById(input.contactId)
    if (!contact || contact.organizationId !== input.organizationId) throw Errors.notFound('Contacto')
    if (!contact.smsConsent) throw Errors.badRequest('El contacto no tiene consentimiento de SMS')
    if (contact.smsOptOut) throw Errors.badRequest('El contacto está en opt-out y no puede recibir SMS')
    await this.rateLimiter.consume(input.organizationId)
    const conversation = await this.ensureConversation(contact)
    const message = await this.store.createMessage({
      id: randomUUID(),
      organizationId: input.organizationId,
      conversationId: conversation.id,
      contactId: contact.id,
      direction: 'outbound',
      body: input.body,
      status: 'queued',
      providerMessageId: null,
    })
    await this.store.touchConversation(conversation.id)
    await writeAudit(this.store, {
      actorId: input.actorId ?? null,
      organizationId: input.organizationId,
      action: 'message.queued',
      entityType: 'message',
      entityId: message.id,
      requestId: input.requestId,
    })
    await this.queue.enqueue('messages.outbound', {
      messageId: message.id,
      organizationId: input.organizationId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
    })
    this.logger.info('message.queued', {
      organizationId: input.organizationId,
      messageId: message.id,
      requestId: input.requestId,
      conversationId: conversation.id,
    })
    return message
  }

  async deliverOutbound(messageId: string, requestId?: string): Promise<void> {
    const message = await this.store.findMessageById(messageId)
    if (!message || message.direction !== 'outbound') return
    if (message.status === 'sent' || message.status === 'delivered' || message.status === 'failed') return
    const step = await this.store.findRunStepByMessageId(message.id)
    if (step) {
      const run = await this.store.findRun(step.runId)
      if (run?.status === 'cancelled') {
        await this.store.updateMessage(message.id, { status: 'failed' })
        return
      }
    }
    const contact = await this.store.findContactById(message.contactId)
    if (!contact || !contact.smsConsent || contact.smsOptOut) {
      await this.store.updateMessage(message.id, { status: 'failed' })
      await this.settle(message, 'failed', requestId)
      return
    }
    try {
      const result = await this.gateway.sendSms({
        to: contact.phone,
        from: this.fromNumber,
        body: message.body,
      })
      await this.store.updateMessage(message.id, {
        status: 'sent',
        providerMessageId: result.providerMessageId,
      })
      this.logger.info('message.sent', {
        organizationId: message.organizationId,
        messageId: message.id,
        requestId,
        providerMessageId: result.providerMessageId,
      })
      await this.settle(message, 'sent', requestId, result.providerMessageId)
    } catch (error) {
      this.logger.error('message.failed', {
        organizationId: message.organizationId,
        messageId: message.id,
        requestId,
        error: error instanceof Error ? error.name : 'Error',
      })
      await this.store.updateMessage(message.id, { status: 'failed' })
      await this.settle(message, 'failed', requestId)
    }
  }

  async acceptInboundWebhook(
    input: { messageSid: string; from: string; to: string; body: string; requestId?: string },
  ): Promise<{ duplicate: boolean }> {
    if (!input.messageSid) throw Errors.badRequest('Datos inválidos')
    const externalId = `sms:${input.messageSid}`
    const created = await this.store.createWebhookEvent({
      id: randomUUID(),
      provider: 'twilio',
      externalId,
    })
    if (!created) return { duplicate: true }
    try {
      await this.queue.enqueue('messages.inbound', {
        messageSid: input.messageSid,
        from: input.from,
        to: input.to,
        body: input.body,
        ...(input.requestId ? { requestId: input.requestId } : {}),
      })
    } catch (error) {
      await this.releaseWebhookClaim('twilio', externalId)
      throw error
    }
    this.logger.info('webhook.accepted', { requestId: input.requestId, provider: 'twilio', kind: 'sms' })
    return { duplicate: false }
  }

  async processInbound(input: {
    messageSid: string
    from: string
    to: string
    body: string
    requestId?: string
  }): Promise<void> {
    const contacts = await this.store.findContactsByPhone(input.from)
    if (contacts.length !== 1) {
      this.logger.info('message.unmatched', { requestId: input.requestId, count: contacts.length })
      return
    }
    const contact = contacts[0]
    if (!contact) return
    if (input.body.trim().toUpperCase() === 'STOP') {
      await this.store.updateContact(contact.id, { smsOptOut: true, smsConsent: false })
      await writeAudit(this.store, {
        organizationId: contact.organizationId,
        action: 'contact.opt_out',
        entityType: 'contact',
        entityId: contact.id,
        requestId: input.requestId,
      })
      this.logger.info('contact.opt_out', {
        organizationId: contact.organizationId,
        contactId: contact.id,
        requestId: input.requestId,
      })
    }
    const conversation = await this.ensureConversation(contact)
    try {
      const message = await this.store.createMessage({
        id: randomUUID(),
        organizationId: contact.organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: 'inbound',
        body: input.body,
        status: 'received',
        providerMessageId: input.messageSid,
      })
      await this.store.touchConversation(conversation.id)
      this.logger.info('message.received', {
        organizationId: contact.organizationId,
        messageId: message.id,
        requestId: input.requestId,
        conversationId: conversation.id,
      })
    } catch (error) {
      if (error instanceof DuplicateError) return
      throw error
    }
  }

  private async releaseWebhookClaim(provider: string, externalId: string): Promise<void> {
    try {
      await this.store.deleteWebhookEvent(provider, externalId)
    } catch (error) {
      this.logger.error('webhook.release_failed', {
        provider,
        error: error instanceof Error ? error.name : 'Error',
      })
    }
  }

  private async settle(
    message: MessageRecord,
    status: 'sent' | 'failed',
    requestId?: string,
    providerMessageId?: string,
  ): Promise<void> {
    await this.onSettled({
      messageId: message.id,
      organizationId: message.organizationId,
      status,
      providerMessageId,
      requestId,
    })
  }

  private async ensureConversation(contact: ContactRecord) {
    const existing = await this.store.findConversationByContact(contact.organizationId, contact.id)
    if (existing) return existing
    return this.store.createConversation({
      id: randomUUID(),
      organizationId: contact.organizationId,
      contactId: contact.id,
      status: 'open',
    })
  }
}
