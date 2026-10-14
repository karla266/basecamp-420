import { randomUUID } from 'node:crypto'
import {
  canAccessAdmin,
  canAccessPortal,
  hashOpaqueToken,
  hashPassword,
  newOpaqueToken,
  organizationIdsInScope,
  verifyPassword,
  type Actor,
} from '@basecamp/shared'
import { writeAudit } from '../audit/audit'
import { DuplicateError, Errors } from '../errors'
import type { Logger } from '../logging/logger'
import type { Store } from '../store/store'
import type { OrganizationRecord } from '../store/types'

const SESSION_MS = 7 * 24 * 60 * 60 * 1000

export type SessionView = {
  user: { id: string; email: string; name: string }
  memberships: Actor['memberships']
  operatorOrganizationIds: string[]
  organizations: Array<Pick<OrganizationRecord, 'id' | 'name' | 'slug' | 'active'>>
  canAccessAdmin: boolean
  canAccessPortal: boolean
}

export class AuthService {
  constructor(
    private readonly store: Store,
    private readonly authSecret: string,
    private readonly logger: Logger,
  ) {}

  async login(email: string, password: string, requestId?: string): Promise<{ token: string; actor: Actor }> {
    const user = await this.store.findUserByEmail(email.trim().toLowerCase())
    if (!user || !verifyPassword(password, user.passwordHash)) throw Errors.unauthorized()
    const token = newOpaqueToken()
    const now = new Date()
    await this.store.createSession({
      id: randomUUID(),
      tokenHash: hashOpaqueToken(token, this.authSecret),
      userId: user.id,
      expiresAt: new Date(now.getTime() + SESSION_MS),
      createdAt: now,
    })
    const actor = await this.actorFor(user.id)
    if (!actor) throw Errors.unauthorized()
    await writeAudit(this.store, {
      actorId: actor.userId,
      action: 'auth.login',
      entityType: 'user',
      entityId: actor.userId,
      requestId,
    })
    this.logger.info('auth.login', { requestId, userId: actor.userId })
    return { token, actor }
  }

  async logout(token: string, requestId?: string): Promise<void> {
    const actor = await this.authenticate(token)
    await this.store.deleteSessionByTokenHash(hashOpaqueToken(token, this.authSecret))
    if (actor) {
      await writeAudit(this.store, {
        actorId: actor.userId,
        action: 'auth.logout',
        entityType: 'user',
        entityId: actor.userId,
        requestId,
      })
    }
  }

  async authenticate(token: string): Promise<Actor | null> {
    const session = await this.store.findSessionByTokenHash(hashOpaqueToken(token, this.authSecret))
    if (!session || session.expiresAt.getTime() <= Date.now()) return null
    return this.actorFor(session.userId)
  }

  async me(actor: Actor): Promise<SessionView> {
    const organizations = await this.organizationsFor(actor)
    return {
      user: { id: actor.userId, email: actor.email, name: actor.name },
      memberships: actor.memberships,
      operatorOrganizationIds: actor.operatorOrganizationIds,
      organizations: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        active: organization.active,
      })),
      canAccessAdmin: canAccessAdmin(actor),
      canAccessPortal: canAccessPortal(actor),
    }
  }

  async actorFor(userId: string): Promise<Actor | null> {
    const user = await this.store.findUserById(userId)
    if (!user) return null
    const memberships = await this.store.listMembershipsByUser(userId)
    const assignments = await this.store.listAssignmentsByOperator(userId)
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      memberships: memberships.map((membership) => ({
        organizationId: membership.organizationId,
        role: membership.role,
      })),
      operatorOrganizationIds: assignments.map((assignment) => assignment.organizationId),
    }
  }

  async organizationsFor(actor: Actor): Promise<OrganizationRecord[]> {
    const scope = organizationIdsInScope(actor)
    if (scope === 'all') {
      const page = await this.store.listOrganizations({ skip: 0, take: 200 })
      return page.items
    }
    return this.store.listOrganizationsByIds(scope)
  }

  async createUser(input: { email: string; name: string; password: string }): Promise<{ id: string }> {
    try {
      const user = await this.store.createUser({
        id: randomUUID(),
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        passwordHash: hashPassword(input.password),
      })
      return { id: user.id }
    } catch (error) {
      if (error instanceof DuplicateError) throw Errors.conflict('Ese correo ya tiene cuenta')
      throw error
    }
  }
}
