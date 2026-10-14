import { randomUUID } from 'node:crypto'
import { isE164, pageQuery, slugify, type Actor } from '@basecamp/shared'
import { writeAudit } from '../audit/audit'
import { DuplicateError, Errors } from '../errors'
import type { Logger } from '../logging/logger'
import type { Store } from '../store/store'
import type { ContactRecord, OrganizationRecord } from '../store/types'
import { assertOperate, assertOrganizationAccess, assertPlatformAdmin, scopeIds } from '../tenancy/access'

type PageQuery = { q?: string; page?: number; pageSize?: number }

export class ClientsService {
  constructor(
    private readonly store: Store,
    private readonly logger: Logger,
    private readonly onSmsConsentGranted: (
      contact: ContactRecord,
      actor: Actor,
      requestId?: string,
    ) => Promise<void>,
  ) {}

  async createOrganization(
    actor: Actor,
    input: { name: string },
    requestId?: string,
  ): Promise<OrganizationRecord> {
    assertPlatformAdmin(actor)
    const base = slugify(input.name)
    let slug = base
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await this.store.findOrganizationBySlug(slug)
      if (!existing) break
      slug = `${base.slice(0, 40)}-${randomUUID().slice(0, 4)}`
    }
    const organization = await this.store.createOrganization({
      id: randomUUID(),
      name: input.name.trim(),
      slug,
      active: true,
    })
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId: organization.id,
      action: 'organization.created',
      entityType: 'organization',
      entityId: organization.id,
      requestId,
    })
    this.logger.info('organization.created', {
      organizationId: organization.id,
      requestId,
      actorId: actor.userId,
    })
    return organization
  }

  async updateOrganization(
    actor: Actor,
    organizationId: string,
    input: { name?: string; active?: boolean },
    requestId?: string,
  ): Promise<OrganizationRecord> {
    assertPlatformAdmin(actor)
    const current = await this.store.findOrganizationById(organizationId)
    if (!current) throw Errors.notFound('Organización')
    const organization = await this.store.updateOrganization(organizationId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'organization.updated',
      entityType: 'organization',
      entityId: organizationId,
      requestId,
    })
    return organization
  }

  async listOrganizations(actor: Actor, query: PageQuery) {
    const page = pageQuery(query)
    const ids = scopeIds(actor)
    return this.store.listOrganizations({
      ids,
      q: query.q?.trim() || undefined,
      skip: page.skip,
      take: page.pageSize,
    }).then((result) => ({ ...result, page: page.page, pageSize: page.pageSize }))
  }

  async getOrganization(actor: Actor, organizationId: string): Promise<OrganizationRecord> {
    assertOrganizationAccess(actor, organizationId)
    const organization = await this.store.findOrganizationById(organizationId)
    if (!organization) throw Errors.notFound('Organización')
    return organization
  }

  async assignOperator(actor: Actor, organizationId: string, userId: string, requestId?: string) {
    assertPlatformAdmin(actor)
    const organization = await this.store.findOrganizationById(organizationId)
    if (!organization) throw Errors.notFound('Organización')
    const memberships = await this.store.listMembershipsByUser(userId)
    if (!memberships.some((membership) => membership.role === 'operator')) {
      throw Errors.badRequest('El usuario no es operador')
    }
    try {
      await this.store.createAssignment({ id: randomUUID(), operatorId: userId, organizationId })
    } catch (error) {
      if (error instanceof DuplicateError) throw Errors.conflict('El operador ya está asignado')
      throw error
    }
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'operator.assigned',
      entityType: 'operator_assignment',
      entityId: userId,
      requestId,
    })
    this.logger.info('operator.assigned', { organizationId, requestId, operatorId: userId })
  }

  async unassignOperator(actor: Actor, organizationId: string, userId: string, requestId?: string) {
    assertPlatformAdmin(actor)
    await this.store.deleteAssignment(userId, organizationId)
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'operator.unassigned',
      entityType: 'operator_assignment',
      entityId: userId,
      requestId,
    })
  }

  async listOperators(actor: Actor, organizationId: string) {
    assertOrganizationAccess(actor, organizationId)
    const assignments = await this.store.listAssignmentsByOrganization(organizationId)
    const users = await Promise.all(assignments.map((assignment) => this.store.findUserById(assignment.operatorId)))
    return users.flatMap((user) => (user ? [{ id: user.id, name: user.name, email: user.email }] : []))
  }

  async createContact(
    actor: Actor,
    organizationId: string,
    input: { name: string; phone: string },
    requestId?: string,
  ): Promise<ContactRecord> {
    assertOperate(actor, organizationId)
    if (!isE164(input.phone)) throw Errors.badRequest('El teléfono debe estar en formato E.164')
    try {
      const contact = await this.store.createContact({
        id: randomUUID(),
        organizationId,
        name: input.name.trim(),
        phone: input.phone,
        smsConsent: false,
        callConsent: false,
        smsOptOut: false,
      })
      await writeAudit(this.store, {
        actorId: actor.userId,
        organizationId,
        action: 'contact.created',
        entityType: 'contact',
        entityId: contact.id,
        requestId,
      })
      this.logger.info('contact.created', { organizationId, requestId, contactId: contact.id })
      return contact
    } catch (error) {
      if (error instanceof DuplicateError) throw Errors.conflict('Ese teléfono ya existe en la organización')
      throw error
    }
  }

  async updateContact(
    actor: Actor,
    organizationId: string,
    contactId: string,
    input: { name?: string; phone?: string },
    requestId?: string,
  ): Promise<ContactRecord> {
    assertOperate(actor, organizationId)
    const current = await this.requireContact(organizationId, contactId)
    if (input.phone && !isE164(input.phone)) throw Errors.badRequest('El teléfono debe estar en formato E.164')
    try {
      const contact = await this.store.updateContact(current.id, {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      })
      await writeAudit(this.store, {
        actorId: actor.userId,
        organizationId,
        action: 'contact.updated',
        entityType: 'contact',
        entityId: contact.id,
        requestId,
      })
      return contact
    } catch (error) {
      if (error instanceof DuplicateError) throw Errors.conflict('Ese teléfono ya existe en la organización')
      throw error
    }
  }

  async listContacts(actor: Actor, organizationId: string, query: PageQuery) {
    assertOrganizationAccess(actor, organizationId)
    const page = pageQuery(query)
    const result = await this.store.listContacts({
      organizationId,
      q: query.q?.trim() || undefined,
      skip: page.skip,
      take: page.pageSize,
    })
    return { ...result, page: page.page, pageSize: page.pageSize }
  }

  async getContact(actor: Actor, organizationId: string, contactId: string): Promise<ContactRecord> {
    assertOrganizationAccess(actor, organizationId)
    return this.requireContact(organizationId, contactId)
  }

  async setConsent(
    actor: Actor,
    organizationId: string,
    contactId: string,
    input: { smsConsent?: boolean; callConsent?: boolean },
    requestId?: string,
  ): Promise<ContactRecord> {
    assertOperate(actor, organizationId)
    const current = await this.requireContact(organizationId, contactId)
    if (input.smsConsent === true && current.smsOptOut) {
      throw Errors.badRequest('El contacto está en opt-out y no puede volver a recibir SMS')
    }
    const smsGranted = input.smsConsent === true && !current.smsConsent
    const contact = await this.store.updateContact(current.id, {
      ...(input.smsConsent !== undefined ? { smsConsent: input.smsConsent } : {}),
      ...(input.callConsent !== undefined ? { callConsent: input.callConsent } : {}),
    })
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'contact.consent_updated',
      entityType: 'contact',
      entityId: contact.id,
      requestId,
    })
    this.logger.info('contact.consent_updated', { organizationId, requestId, contactId: contact.id })
    if (smsGranted) await this.onSmsConsentGranted(contact, actor, requestId)
    return contact
  }

  private async requireContact(organizationId: string, contactId: string): Promise<ContactRecord> {
    const contact = await this.store.findContactById(contactId)
    if (!contact || contact.organizationId !== organizationId) throw Errors.notFound('Contacto')
    return contact
  }
}
