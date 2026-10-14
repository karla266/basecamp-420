import {
  canAccessOrganization,
  canInvite,
  canOperate,
  isPlatformAdmin,
  organizationIdsInScope,
  type Actor,
  type Role,
} from '@basecamp/shared'
import { AppError, Errors } from '../errors'

export function assertOrganizationAccess(actor: Actor, organizationId: string): void {
  if (!canAccessOrganization(actor, organizationId)) throw Errors.forbidden()
}

export function assertOperate(actor: Actor, organizationId: string): void {
  assertOrganizationAccess(actor, organizationId)
  if (!canOperate(actor, organizationId)) {
    throw new AppError(403, 'No tienes permiso para operar esta organización', 'forbidden')
  }
}

export function assertPlatformAdmin(actor: Actor): void {
  if (!isPlatformAdmin(actor)) {
    throw new AppError(403, 'Solo la administración de la plataforma puede hacer esto', 'forbidden')
  }
}

export function assertCanInvite(actor: Actor, organizationId: string | null, role: Role): void {
  if (!canInvite(actor, organizationId, role)) {
    throw new AppError(403, 'No puedes invitar con ese rol', 'forbidden')
  }
}

export function scopeIds(actor: Actor): string[] | undefined {
  const scope = organizationIdsInScope(actor)
  return scope === 'all' ? undefined : scope
}
