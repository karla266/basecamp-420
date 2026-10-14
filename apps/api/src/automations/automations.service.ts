import { randomUUID } from 'node:crypto'
import type { Actor } from '@basecamp/shared'
import { writeAudit } from '../audit/audit'
import { AppError, Errors } from '../errors'
import type { Logger } from '../logging/logger'
import type { MessagingService, OutboundSettlement } from '../messaging/messaging.service'
import type { JobEnqueuer } from '../queue/queue'
import type { Store } from '../store/store'
import type { AutomationStepRecord, ContactRecord, RunRecord } from '../store/types'
import { assertOperate, assertOrganizationAccess } from '../tenancy/access'

const MAX_ATTEMPTS = 3

export class AutomationService {
  constructor(
    private readonly store: Store,
    private readonly messaging: MessagingService,
    private readonly queue: JobEnqueuer,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(
    actor: Actor,
    organizationId: string,
    input: {
      name: string
      trigger: 'contact_created' | 'manual'
      steps: Array<{ templateId: string; waitMinutes: number }>
    },
    requestId?: string,
  ) {
    assertOperate(actor, organizationId)
    for (const step of input.steps) {
      const template = await this.store.findTemplate(step.templateId)
      if (!template || template.organizationId !== organizationId) {
        throw Errors.badRequest('La plantilla no pertenece a la organización')
      }
    }
    const automation = await this.store.createAutomation({
      id: randomUUID(),
      organizationId,
      name: input.name.trim(),
      trigger: input.trigger,
      active: true,
      steps: input.steps.map((step, index) => ({
        id: randomUUID(),
        position: index,
        templateId: step.templateId,
        waitMinutes: step.waitMinutes,
      })),
    })
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'automation.created',
      entityType: 'automation',
      entityId: automation.id,
      requestId,
    })
    return automation
  }

  async list(actor: Actor, organizationId: string) {
    assertOrganizationAccess(actor, organizationId)
    return this.store.listAutomations(organizationId)
  }

  async listRuns(actor: Actor, organizationId: string, automationId: string) {
    assertOrganizationAccess(actor, organizationId)
    const automation = await this.requireAutomation(organizationId, automationId)
    const runs = await this.store.listRuns(automation.id)
    return Promise.all(
      runs.map(async (run) => ({
        ...run,
        steps: await this.store.listRunSteps(run.id),
      })),
    )
  }

  async startManual(
    actor: Actor,
    organizationId: string,
    automationId: string,
    contactId: string,
    requestId?: string,
  ) {
    assertOperate(actor, organizationId)
    const automation = await this.requireAutomation(organizationId, automationId)
    const contact = await this.store.findContactById(contactId)
    if (!contact || contact.organizationId !== organizationId) throw Errors.notFound('Contacto')
    if (!contact.smsConsent || contact.smsOptOut) {
      throw Errors.badRequest('El contacto no puede recibir la secuencia')
    }
    const open = (await this.store.listRunsForPair(automation.id, contact.id)).find(
      (run) => run.status === 'running' || run.status === 'pending',
    )
    if (open) throw Errors.conflict('Ya hay una ejecución en curso para este contacto')
    return this.createRun(automation.id, contact, requestId)
  }

  async onContactConsent(contact: ContactRecord, _actor: Actor, requestId?: string): Promise<void> {
    if (!contact.smsConsent || contact.smsOptOut) return
    const automations = await this.store.listActiveAutomations(contact.organizationId, 'contact_created')
    let started = false
    for (const automation of automations) {
      const existing = await this.store.listRunsForPair(automation.id, contact.id)
      if (existing.length > 0) continue
      await this.createRun(automation.id, contact, requestId)
      started = true
    }
    if (started) {
      this.logger.info('automation.started', {
        organizationId: contact.organizationId,
        contactId: contact.id,
        requestId,
      })
    }
  }

  async cancel(actor: Actor, organizationId: string, runId: string, requestId?: string) {
    assertOperate(actor, organizationId)
    const run = await this.store.findRun(runId)
    if (!run || run.organizationId !== organizationId) throw Errors.notFound('Ejecución')
    if (run.status !== 'running' && run.status !== 'pending') {
      throw Errors.badRequest('La ejecución ya terminó')
    }
    await this.store.updateRun(run.id, { status: 'cancelled', nextRunAt: null })
    const pending = await this.store.findPendingRunStep(run.id)
    if (pending) await this.store.updateRunStep(pending.id, { status: 'skipped', error: 'cancelada' })
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'automation.cancelled',
      entityType: 'automation_run',
      entityId: run.id,
      requestId,
    })
    this.logger.info('automation.cancelled', { organizationId, runId: run.id, requestId })
  }

  async processDue(): Promise<void> {
    const now = this.now()
    for (let guard = 0; guard < 20; guard += 1) {
      const runs = await this.store.listDueRuns(now)
      if (runs.length === 0) return
      for (const run of runs) await this.advance(run)
    }
  }

  async handleOutboundSettlement(event: OutboundSettlement): Promise<void> {
    const step = await this.store.findRunStepByMessageId(event.messageId)
    if (!step || step.status !== 'pending') return
    const run = await this.store.findRun(step.runId)
    if (!run || run.status === 'cancelled') return
    if (event.status === 'failed') {
      const attempts = run.attemptCount + 1
      if (attempts >= MAX_ATTEMPTS) {
        await this.store.updateRunStep(step.id, { status: 'failed', error: 'envio fallido' })
        await this.store.updateRun(run.id, { status: 'failed', attemptCount: attempts, nextRunAt: null })
        this.logger.info('automation.failed', {
          organizationId: run.organizationId,
          runId: run.id,
          requestId: event.requestId,
        })
        return
      }
      await this.store.updateRunStep(step.id, { status: 'failed', error: 'reintento' })
      await this.store.updateRun(run.id, {
        status: 'running',
        attemptCount: attempts,
        nextRunAt: new Date(this.now().getTime() + attempts * 60_000),
      })
      this.logger.info('automation.retry', {
        organizationId: run.organizationId,
        runId: run.id,
        requestId: event.requestId,
        attempt: attempts,
      })
      return
    }
    await this.store.updateRunStep(step.id, {
      status: 'sent',
      providerMessageId: event.providerMessageId ?? null,
    })
    const automation = await this.store.findAutomation(run.automationId)
    const ordered = [...(automation?.steps ?? [])].sort((a, b) => a.position - b.position)
    const nextIndex = run.currentStep + 1
    if (!automation || nextIndex >= ordered.length) {
      await this.store.updateRun(run.id, {
        status: 'completed',
        currentStep: nextIndex,
        nextRunAt: null,
        attemptCount: 0,
      })
      this.logger.info('automation.completed', {
        organizationId: run.organizationId,
        runId: run.id,
        requestId: event.requestId,
      })
      return
    }
    const waitMinutes = ordered[nextIndex]?.waitMinutes ?? 0
    await this.store.updateRun(run.id, {
      status: 'running',
      currentStep: nextIndex,
      attemptCount: 0,
      nextRunAt: new Date(this.now().getTime() + waitMinutes * 60_000),
    })
    if (waitMinutes === 0) {
      await this.queue.enqueue('automations.tick', event.requestId ? { requestId: event.requestId } : {})
    }
  }

  private async createRun(automationId: string, contact: ContactRecord, requestId?: string) {
    const run = await this.store.createRun({
      id: randomUUID(),
      automationId,
      contactId: contact.id,
      organizationId: contact.organizationId,
      status: 'running',
      currentStep: 0,
      nextRunAt: this.now(),
      attemptCount: 0,
    })
    await this.queue.enqueue('automations.tick', requestId ? { requestId } : {})
    return run
  }

  private async advance(run: RunRecord): Promise<void> {
    if (run.status !== 'running') return
    if (await this.store.findPendingRunStep(run.id)) return
    const automation = await this.store.findAutomation(run.automationId)
    if (!automation?.active) {
      await this.store.updateRun(run.id, { status: 'failed', nextRunAt: null })
      return
    }
    const ordered = [...automation.steps].sort((a, b) => a.position - b.position)
    const step = ordered[run.currentStep]
    if (!step) {
      await this.store.updateRun(run.id, { status: 'completed', nextRunAt: null })
      return
    }
    const contact = await this.store.findContactById(run.contactId)
    if (!contact || !contact.smsConsent || contact.smsOptOut) {
      await this.store.createRunStep({
        id: randomUUID(),
        runId: run.id,
        stepId: step.id,
        messageId: null,
        status: 'skipped',
        providerMessageId: null,
        error: 'sin consentimiento',
      })
      await this.store.updateRun(run.id, { status: 'failed', nextRunAt: null })
      this.logger.info('automation.skipped', { organizationId: run.organizationId, runId: run.id })
      return
    }
    const template = await this.store.findTemplate(step.templateId)
    if (!template) {
      await this.failAttempt(run, step, 'plantilla no encontrada')
      return
    }
    try {
      const message = await this.messaging.queueOutbound({
        organizationId: run.organizationId,
        contactId: contact.id,
        body: template.body.replaceAll('{{name}}', contact.name),
      })
      await this.store.createRunStep({
        id: randomUUID(),
        runId: run.id,
        stepId: step.id,
        messageId: message.id,
        status: 'pending',
        providerMessageId: null,
        error: null,
      })
    } catch (error) {
      const message = error instanceof AppError ? error.code : 'error'
      await this.failAttempt(run, step, message)
    }
  }

  private async failAttempt(run: RunRecord, step: AutomationStepRecord, code: string): Promise<void> {
    const attempts = run.attemptCount + 1
    await this.store.createRunStep({
      id: randomUUID(),
      runId: run.id,
      stepId: step.id,
      messageId: null,
      status: 'failed',
      providerMessageId: null,
      error: code,
    })
    if (attempts >= MAX_ATTEMPTS) {
      await this.store.updateRun(run.id, { status: 'failed', attemptCount: attempts, nextRunAt: null })
      return
    }
    await this.store.updateRun(run.id, {
      status: 'running',
      attemptCount: attempts,
      nextRunAt: new Date(this.now().getTime() + attempts * 60_000),
    })
  }

  private async requireAutomation(organizationId: string, automationId: string) {
    const automation = await this.store.findAutomation(automationId)
    if (!automation || automation.organizationId !== organizationId) throw Errors.notFound('Automatización')
    return automation
  }
}
