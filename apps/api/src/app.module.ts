import { Module } from '@nestjs/common'
import { AdminController } from './admin/admin.controller'
import { AuthController } from './auth/auth.controller'
import { AutomationsController } from './automations/automations.controller'
import { CallsController } from './calls/calls.controller'
import { ClientsController } from './clients/clients.controller'
import { APP_CONTEXT, createProductionContext } from './context'
import { HealthController } from './http/health.controller'
import { AppExceptionFilter } from './http/http'
import { MessagingController } from './messaging/messaging.controller'
import { WebhooksController } from './messaging/webhooks.controller'

@Module({
  controllers: [
    HealthController,
    AuthController,
    ClientsController,
    AdminController,
    MessagingController,
    AutomationsController,
    CallsController,
    WebhooksController,
  ],
  providers: [
    {
      provide: APP_CONTEXT,
      useFactory: () => createProductionContext(),
    },
    {
      provide: AppExceptionFilter,
      useFactory: (app: { logger: ConstructorParameters<typeof AppExceptionFilter>[0] }) =>
        new AppExceptionFilter(app.logger),
      inject: [APP_CONTEXT],
    },
  ],
})
export class AppModule {}
