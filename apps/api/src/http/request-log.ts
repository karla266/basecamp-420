import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from '@nestjs/common'
import { tap, type Observable } from 'rxjs'
import { APP_CONTEXT, type AppContext } from '../context'
import type { AuthedRequest } from './http'

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  constructor(@Inject(APP_CONTEXT) private readonly app: AppContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthedRequest>()
    const started = Date.now()
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<{ statusCode?: number }>()
        const path = (request.path ?? request.url ?? '').split('?')[0]
        this.app.logger.info('request.completed', {
          requestId: request.requestId,
          method: request.method,
          path,
          status: response.statusCode,
          durationMs: Date.now() - started,
          organizationId: request.params?.organizationId,
        })
      }),
    )
  }
}
