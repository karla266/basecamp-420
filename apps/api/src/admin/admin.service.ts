import { randomUUID } from 'node:crypto'
import {
  hashOpaqueToken,
  isPlatformAdmin,
  newOpaqueToken,
  pageQuery,
  type Actor,
  type Role,
} from '@basecamp/shared'
import { writeAudit } from '../audit/audit'
import { DuplicateError, Errors } from '../errors'
import type { AuthService } from '../auth/auth.service'
import type { Logger } from '../logging/logger'
import type { Store } from '../store/store'
import { assertCanInvite, assertOrganizationAccess, scopeIds } from '../tenancy/access'

const INVITE_MS = 7 * 24 * 60 * 60 * 1000

export class AdminService {
  constructor(
    private readonly store: Store,
    private readonly auth: AuthService,
    private readonly authSecret: string,
    private readonly logger: Logger,
  ) {}

  async listUsers(
    actor: Actor,
    query: { q?: string; page?: number; pageSize?: number; role?: Role; organizationId?: string },
  ) {
    if (query.organizationId) assertOrganizationAccess(actor, query.organizationId)
    const page = pageQuery(query)
    const scope = query.organizationId ? [query.organizationId] : scopeIds(actor)
    const result = await this.store.listUsers({
      q: query.q?.trim() || undefined,
      role: query.role,
      organizationIds: scope,
      skip: page.skip,
      take: page.pageSize,
    })
    const items = await Promise.all(
      result.items.map(async (user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        memberships: await this.store.listMembershipsByUser(user.id),
      })),
    )
    return { ...result, items, page: page.page, pageSize: page.pageSize }
  }

  async invite(
    actor: Actor,
    input: { email: string; role: Role; organizationId?: string | null },
    requestId?: string,
  ): Promise<{ acceptPath: string }> {
    let organizationId = input.organizationId ?? null
    if (!isPlatformAdmin(actor)) {
      organizationId =
        actor.memberships.find((membership) => membership.role === 'client_admin')?.organizationId ?? null
    }
    assertCanInvite(actor, organizationId, input.role)
    if ((input.role === 'client_admin' || input.role === 'client_viewer') && !organizationId) {
      throw Errors.badRequest('La invitación de cliente requiere organización')
    }
    if (organizationId) {
      const organization = await this.store.findOrganizationById(organizationId)
      if (!organization) throw Errors.notFound('Organización')
    }
    const token = newOpaqueToken()
    const invitation = await this.store.createInvitation({
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      organizationId: input.role === 'platform_admin' ? null : organizationId,
      role: input.role,
      tokenHash: hashOpaqueToken(token, this.authSecret),
      invitedById: actor.userId,
      expiresAt: new Date(Date.now() + INVITE_MS),
    })
    await writeAudit(this.store, {
      actorId: actor.userId,
      organizationId,
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: invitation.id,
      requestId,
    })
    this.logger.info('invitation.created', {
      organizationId,
      requestId,
      invitationId: invitation.id,
      role: input.role,
    })
    return { acceptPath: `/invitacion?token=${token}` }
  }

  async acceptInvite(input: { token: string; name: string; password: string }, requestId?: string) {
    const invitation = await this.store.findInvitationByTokenHash(
      hashOpaqueToken(input.token, this.authSecret),
    )
    if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
      throw Errors.badRequest('La invitación no es válida')
    }
    let user = await this.store.findUserByEmail(invitation.email)
    if (!user) {
      const created = await this.auth.createUser({
        email: invitation.email,
        name: input.name,
        password: input.password,
      })
      user = await this.store.findUserById(created.id)
    }
    if (!user) throw Errors.badRequest('No se pudo crear la cuenta')
    const membershipOrg =
      invitation.role === 'client_admin' || invitation.role === 'client_viewer'
        ? invitation.organizationId
        : null
    try {
      await this.store.createMembership({
        id: randomUUID(),
        userId: user.id,
        organizationId: membershipOrg,
        role: invitation.role,
      })
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error
    }
    if (invitation.role === 'operator' && invitation.organizationId) {
      try {
        await this.store.createAssignment({
          id: randomUUID(),
          operatorId: user.id,
          organizationId: invitation.organizationId,
        })
      } catch (error) {
        if (!(error instanceof DuplicateError)) throw error
      }
    }
    await this.store.markInvitationAccepted(invitation.id, new Date())
    await writeAudit(this.store, {
      actorId: user.id,
      organizationId: invitation.organizationId,
      action: 'invitation.accepted',
      entityType: 'invitation',
      entityId: invitation.id,
      requestId,
    })
    this.logger.info('invitation.accepted', {
      organizationId: invitation.organizationId,
      requestId,
      userId: user.id,
    })
    return { email: user.email }
  }
}
