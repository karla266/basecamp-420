import { randomUUID } from 'node:crypto'
import type { VoiceGateway } from '@basecamp/comms'
import { pageQuery, type Actor } from '@basecamp/shared'
import { writeAudit } from '../audit/audit'
import { Errors } from '../errors'
import type { Logger } from '../logging/logger'
import type { JobEnqueuer } from '../queue/queue'
import type { ObjectStorage } from '../storage/storage'
import type { Store } from '../store/store'
import type { CallStatusName } from '../store/types'
import { assertOperate, assertOrganizationAccess } from '../tenancy/access'

const ACTIVE: CallStatusName[] = ['placed', 'ringing', 'in_progress']
const TERMINAL: CallStatusName[] = ['completed', 'failed', 'canceled']

export function mapTwilioCallStatus(status: string): CallStatusName | null {
  switch (status) {
    case 'queued':
    case 'initiated':
      return 'placed'
    case 'ringing':
      return 'ringing'
    case 'in-progress':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'busy':
    case 'failed':
    case 'no-answer':
      return 'failed'
    case 'canceled':
      return 'canceled'
    default:
      return null
  }
}

export class CallsService {
  constructor(
    private readonly store: Store,
    private readonly voice: VoiceGateway,
    private readonly storage: ObjectStorage,
    private readonly queue: JobEnqueuer,
    private readonly logger: Logger,
    private readonly fromNumber: string,
  ) {}

  async place(actor: Actor, organizationId: string, contactId: string, requestId?: string) {
    assertOperate(actor, organizationId)
    const contact = await this.store.findContactById(contactId)
    if (!contact || contact.organizationId !== organizationId) throw Errors.notFound('Contacto')
    if (!contact.callConsent) throw Errors.badRequest('El contacto no tiene consentimiento de llamada')
    const active = await this.store.findActiveCallForOperator(actor.userId)
    if (active) throw Errors.conflict('Ya hay una llamada en curso')
    const call = await this.store.createCall({
      id: randomUUID(),
      organizationId,
      contactId: contact.id,
      operatorId: actor.userId,
      status: 'placed',
      providerCallId: null,
      fromNumber: this.fromNumber,
      toNumber: contact.phone,
      startedAt: null,
      endedAt: null,
    })
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'call.placed',
      entityType: 'call',
      entityId: call.id,
      requestId,
    })
    await this.queue.enqueue('calls.outbound', {
      callId: call.id,
      organizationId,
      ...(requestId ? { requestId } : {}),
    })
    this.logger.info('call.queued', { organizationId, callId: call.id, requestId })
    return call
  }

  async dial(callId: string, requestId?: string): Promise<void> {
    const call = await this.store.findCallById(callId)
    if (!call || call.providerCallId) return
    const result = await this.voice.placeCall({ to: call.toNumber, from: call.fromNumber })
    await this.store.updateCall(call.id, {
      providerCallId: result.providerCallId,
      status: 'placed',
      startedAt: new Date(),
    })
    this.logger.info('call.placed', {
      organizationId: call.organizationId,
      callId: call.id,
      requestId,
      providerCallId: result.providerCallId,
    })
  }

  async acceptStatusWebhook(input: {
    callSid: string
    callStatus: string
    recordingUrl?: string
    recordingSid?: string
    recordingDuration?: string
    requestId?: string
  }): Promise<{ duplicate: boolean }> {
    if (!input.callSid || !input.callStatus) throw Errors.badRequest('Datos inválidos')
    const externalId = input.recordingSid
      ? `voice:${input.callSid}:${input.callStatus}:${input.recordingSid}`
      : `voice:${input.callSid}:${input.callStatus}`
    const created = await this.store.createWebhookEvent({
      id: randomUUID(),
      provider: 'twilio',
      externalId,
    })
    if (!created) return { duplicate: true }
    try {
      await this.queue.enqueue('calls.status', {
        callSid: input.callSid,
        callStatus: input.callStatus,
        ...(input.recordingUrl ? { recordingUrl: input.recordingUrl } : {}),
        ...(input.recordingSid ? { recordingSid: input.recordingSid } : {}),
        ...(input.recordingDuration ? { recordingDuration: input.recordingDuration } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
      })
    } catch (error) {
      await this.releaseWebhookClaim(externalId)
      throw error
    }
    this.logger.info('webhook.accepted', { requestId: input.requestId, provider: 'twilio', kind: 'voice' })
    return { duplicate: false }
  }

  async applyStatus(input: {
    callSid: string
    callStatus: string
    recordingUrl?: string
    recordingSid?: string
    recordingDuration?: string
    requestId?: string
  }): Promise<void> {
    const call = await this.store.findCallByProviderId(input.callSid)
    if (!call) {
      this.logger.info('call.unmatched', { requestId: input.requestId })
      return
    }
    const status = mapTwilioCallStatus(input.callStatus)
    if (!status) return
    const terminal = TERMINAL.includes(status)
    await this.store.updateCall(call.id, {
      status,
      ...(status === 'in_progress' && !call.startedAt ? { startedAt: new Date() } : {}),
      ...(terminal ? { endedAt: new Date() } : {}),
    })
    if (input.recordingSid && input.recordingUrl) {
      const existing = await this.store.listRecordingsByCall(call.id)
      if (!existing.some((recording) => recording.storageKey.endsWith(`${input.recordingSid}.json`))) {
        const duration = input.recordingDuration ? Number(input.recordingDuration) : null
        const stored = await this.storage.putRecordingMetadata({
          organizationId: call.organizationId,
          callId: call.id,
          recordingSid: input.recordingSid,
          sourceUrl: input.recordingUrl,
          contentType: 'audio/mpeg',
        })
        await this.store.createRecording({
          id: randomUUID(),
          callId: call.id,
          organizationId: call.organizationId,
          storageKey: stored.key,
          url: stored.url,
          contentType: 'audio/mpeg',
          durationSeconds: Number.isFinite(duration) ? duration : null,
        })
      }
    }
    await writeAudit(this.store, {
      organizationId: call.organizationId,
      action: 'call.status_updated',
      entityType: 'call',
      entityId: call.id,
      requestId: input.requestId,
    })
    this.logger.info('call.status', {
      organizationId: call.organizationId,
      callId: call.id,
      requestId: input.requestId,
      status,
    })
  }

  private async releaseWebhookClaim(externalId: string): Promise<void> {
    try {
      await this.store.deleteWebhookEvent('twilio', externalId)
    } catch (error) {
      this.logger.error('webhook.release_failed', {
        provider: 'twilio',
        error: error instanceof Error ? error.name : 'Error',
      })
    }
  }

  async list(actor: Actor, organizationId: string, query: { page?: number; pageSize?: number }) {
    assertOrganizationAccess(actor, organizationId)
    const page = pageQuery(query)
    const result = await this.store.listCalls({ organizationId, skip: page.skip, take: page.pageSize })
    const items = await Promise.all(result.items.map((call) => this.present(call)))
    return { ...result, items, page: page.page, pageSize: page.pageSize }
  }

  async get(actor: Actor, organizationId: string, callId: string) {
    assertOrganizationAccess(actor, organizationId)
    const call = await this.store.findCallById(callId)
    if (!call || call.organizationId !== organizationId) throw Errors.notFound('Llamada')
    return this.present(call)
  }

  private async present(call: {
    id: string
    organizationId: string
    contactId: string
    operatorId: string
    status: CallStatusName
    providerCallId: string | null
    startedAt: Date | null
    endedAt: Date | null
    createdAt: Date
  }) {
    const contact = await this.store.findContactById(call.contactId)
    const recordings = await this.store.listRecordingsByCall(call.id)
    return {
      id: call.id,
      organizationId: call.organizationId,
      contactId: call.contactId,
      operatorId: call.operatorId,
      status: call.status,
      providerCallId: call.providerCallId,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      createdAt: call.createdAt,
      contactName: contact?.name ?? 'Contacto',
      contactPhone: contact?.phone ?? '',
      active: ACTIVE.includes(call.status),
      recordings: recordings.map((recording) => ({
        id: recording.id,
        storageKey: recording.storageKey,
        url: recording.url,
        contentType: recording.contentType,
        durationSeconds: recording.durationSeconds,
        createdAt: recording.createdAt,
      })),
    }
  }
}
