import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common'
import { ZodError } from 'zod'
import { canAccessOrganization, SESSION_COOKIE, type Actor } from '@basecamp/shared'
import { APP_CONTEXT, type AppContext } from '../context'
import { AppError } from '../errors'
import type { Logger } from '../logging/logger'

export type AuthedRequest = {
  actor?: Actor
  requestId?: string
  cookies?: Record<string, string>
  headers: Record<string, string | string[] | undefined>
  params: Record<string, string>
  method: string
  path?: string
  url?: string
  body?: unknown
  query?: unknown
  header?: (name: string) => string | undefined
}

export function requestIdOf(req: AuthedRequest): string | undefined {
  return req.requestId
}

export function actorOf(req: AuthedRequest): Actor {
  if (!req.actor) throw new AppError(401, 'Inicia sesión', 'unauthorized')
  return req.actor
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>()
    const token = req.cookies?.[SESSION_COOKIE]
    if (!token) throw new AppError(401, 'Inicia sesión', 'unauthorized')
    const actor = await this.app.auth.authenticate(token)
    if (!actor) throw new AppError(401, 'Inicia sesión', 'unauthorized')
    req.actor = actor
    return true
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>()
    const organizationId = req.params.organizationId
    if (!organizationId) return true
    if (!req.actor) throw new AppError(401, 'Inicia sesión', 'unauthorized')
    if (!canAccessOrganization(req.actor, organizationId)) {
      throw new AppError(403, 'No tienes acceso a esta organización', 'forbidden')
    }
    return true
  }
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const response = http.getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>()
    const request = http.getRequest<AuthedRequest>()
    if (exception instanceof AppError) {
      response.status(exception.status).json({ error: exception.message, code: exception.code })
      return
    }
    if (exception instanceof ZodError) {
      response.status(400).json({ error: 'Datos inválidos', code: 'bad_request' })
      return
    }
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({ error: exception.message, code: 'http_error' })
      return
    }
    this.logger.error('request.failed', {
      requestId: request.requestId,
      error: exception instanceof Error ? exception.name : 'Error',
    })
    response.status(500).json({ error: 'Error interno', code: 'internal' })
  }
}
