import { randomUUID } from 'node:crypto'
import { FakeMessageGateway, FakeVoiceGateway } from '@basecamp/comms'
import { hashPassword, type Actor, type Role } from '@basecamp/shared'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import { AdminController } from '../admin/admin.controller'
import { AuthController } from '../auth/auth.controller'
import { AutomationsController } from '../automations/automations.controller'
import { CallsController } from '../calls/calls.controller'
import { ClientsController } from '../clients/clients.controller'
import { APP_CONTEXT, createAppContext, type AppContext } from '../context'
import { AppExceptionFilter, SessionGuard, TenantGuard } from '../http/http'
import { HealthController } from '../http/health.controller'
import { requestIdMiddleware } from '../http/request-id'
import { createBufferLogger } from '../logging/logger'
import { MessagingController } from '../messaging/messaging.controller'
import { WebhooksController } from '../messaging/webhooks.controller'
import { dispatchJob } from '../queue/dispatch'
import type { JobEnqueuer, QueueName } from '../queue/queue'
import { MemoryRateLimiter } from '../rate-limit/rate-limiter'
import { MemoryStore } from '../store/memory-store'
import { MemoryObjectStorage } from '../storage/storage'

export type TestApp = AppContext & {
  store: MemoryStore
  messages: FakeMessageGateway
  voice: FakeVoiceGateway
  storage: MemoryObjectStorage
  jobs: Array<{ queue: QueueName; data: Record<string, unknown> }>
  lines: string[]
  drain: () => Promise<void>
}

export async function createTestApp(options?: { smsLimit?: number; now?: () => Date }): Promise<TestApp> {
  const store = new MemoryStore()
  const messages = new FakeMessageGateway()
  const voice = new FakeVoiceGateway()
  const storage = new MemoryObjectStorage()
  const jobs: TestApp['jobs'] = []
  const queue: JobEnqueuer = {
    async enqueue(name, data) {
      jobs.push({ queue: name, data })
    },
  }
  const buffered = createBufferLogger()
  const app = createAppContext({
    store,
    messages,
    voice,
    storage,
    queue,
    rateLimiter: new MemoryRateLimiter(options?.smsLimit ?? 30),
    logger: buffered.logger,
    authSecret: 'test-secret',
    fromNumber: '+15005550006',
    now: options?.now,
  })

  async function drain(): Promise<void> {
    for (let guard = 0; guard < 50 && jobs.length > 0; guard += 1) {
      const job = jobs.shift()
      if (!job) break
      await dispatchJob(app, job)
    }
  }

  return { ...app, store, messages, voice, storage, jobs, lines: buffered.lines, drain }
}

export async function seedUser(
  app: TestApp,
  input: { email: string; password: string; name?: string; role: Role; organizationId?: string | null },
): Promise<{ actor: Actor; token: string; userId: string }> {
  const user = await app.store.createUser({
    id: randomUUID(),
    email: input.email.toLowerCase(),
    name: input.name ?? input.email,
    passwordHash: hashPassword(input.password),
  })
  const membershipOrg =
    input.role === 'client_admin' || input.role === 'client_viewer' ? (input.organizationId ?? null) : null
  await app.store.createMembership({
    id: randomUUID(),
    userId: user.id,
    organizationId: membershipOrg,
    role: input.role,
  })
  if (input.role === 'operator' && input.organizationId) {
    await app.store.createAssignment({
      id: randomUUID(),
      operatorId: user.id,
      organizationId: input.organizationId,
    })
  }
  const session = await app.auth.login(input.email, input.password, 'seed')
  const actor = await app.auth.authenticate(session.token)
  if (!actor) throw new Error('seed login failed')
  return { actor, token: session.token, userId: user.id }
}

export async function createHttp(app: AppContext) {
  const moduleRef = await Test.createTestingModule({
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
    providers: [{ provide: APP_CONTEXT, useValue: app }, SessionGuard, TenantGuard],
  }).compile()
  const nest = moduleRef.createNestApplication()
  nest.use(requestIdMiddleware)
  nest.use(cookieParser())
  nest.useGlobalFilters(new AppExceptionFilter(app.logger))
  await nest.init()
  return nest
}
