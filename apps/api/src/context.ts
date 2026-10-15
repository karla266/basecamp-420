import { Queue } from 'bullmq'
import {
  FakeMessageGateway,
  FakeVoiceGateway,
  TwilioMessageGateway,
  TwilioVoiceGateway,
} from '@basecamp/comms'
import { prisma } from '@basecamp/db'
import IORedis from 'ioredis'
import { AdminService } from './admin/admin.service'
import { SummaryService } from './admin/summary.service'
import { AuthService } from './auth/auth.service'
import { AutomationService } from './automations/automations.service'
import { CallsService } from './calls/calls.service'
import { ClientsService } from './clients/clients.service'
import { Errors } from './errors'
import { createLogger, type Logger } from './logging/logger'
import { MessagingService } from './messaging/messaging.service'
import type { JobEnqueuer, QueueName } from './queue/queue'
import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from './rate-limit/rate-limiter'
import { PrismaStore } from './store/prisma-store'
import type { Store } from './store/store'
import { MemoryObjectStorage, S3ObjectStorage, type ObjectStorage } from './storage/storage'

export const APP_CONTEXT = Symbol('APP_CONTEXT')

export type AppContext = {
  store: Store
  auth: AuthService
  clients: ClientsService
  admin: AdminService
  summary: SummaryService
  messaging: MessagingService
  automations: AutomationService
  calls: CallsService
  logger: Logger
}

export type AppPorts = {
  store: Store
  messages: ConstructorParameters<typeof MessagingService>[1]
  voice: ConstructorParameters<typeof CallsService>[1]
  storage: ObjectStorage
  queue: JobEnqueuer
  rateLimiter: RateLimiter
  logger: Logger
  authSecret: string
  fromNumber: string
  now?: () => Date
}

export function createAppContext(ports: AppPorts): AppContext {
  const auth = new AuthService(ports.store, ports.authSecret, ports.logger)
  const messaging = new MessagingService(
    ports.store,
    ports.messages,
    ports.queue,
    ports.rateLimiter,
    ports.logger,
    ports.fromNumber,
  )
  const automations = new AutomationService(
    ports.store,
    messaging,
    ports.queue,
    ports.logger,
    ports.now,
  )
  messaging.setOutboundHandler((event) => automations.handleOutboundSettlement(event))
  const clients = new ClientsService(ports.store, ports.logger, (contact, actor, requestId) =>
    automations.onContactConsent(contact, actor, requestId),
  )
  const calls = new CallsService(
    ports.store,
    ports.voice,
    ports.storage,
    ports.queue,
    ports.logger,
    ports.fromNumber,
  )
  return {
    store: ports.store,
    auth,
    clients,
    admin: new AdminService(ports.store, auth, ports.authSecret, ports.logger),
    summary: new SummaryService(ports.store),
    messaging,
    automations,
    calls,
    logger: ports.logger,
  }
}

const shutdownSteps: Array<() => Promise<void>> = []

function trackRedis(connection: IORedis, logger: Logger): IORedis {
  connection.on('error', (error: Error) => {
    logger.error('redis.error', { error: error.name })
  })
  return connection
}

export async function closeProductionResources(): Promise<void> {
  const steps = shutdownSteps.splice(0)
  for (const step of steps) {
    try {
      await step()
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'shutdown.cleanup_failed',
          error: error instanceof Error ? error.name : 'Error',
        }),
      )
    }
  }
}

class BullJobEnqueuer implements JobEnqueuer {
  private readonly queues = new Map<QueueName, Queue>()

  constructor(private readonly connection: IORedis) {}

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()))
    this.queues.clear()
  }

  async enqueue(queue: QueueName, data: Record<string, unknown>): Promise<void> {
    let bull = this.queues.get(queue)
    if (!bull) {
      bull = new Queue(queue, { connection: this.connection })
      this.queues.set(queue, bull)
    }
    await bull.add(queue, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 200,
      removeOnFail: 200,
    })
  }
}

export function createProductionContext(): AppContext {
  const databaseUrl = process.env.DATABASE_URL
  const authSecret = process.env.AUTH_SECRET
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  if (!authSecret) throw new Error('AUTH_SECRET is required')
  const logger = createLogger()
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+15005550006'
  const messages =
    accountSid && authToken
      ? new TwilioMessageGateway({ accountSid, authToken })
      : new FakeMessageGateway()
  const voice =
    accountSid && authToken
      ? new TwilioVoiceGateway(
          { accountSid, authToken },
          process.env.PUBLIC_API_URL ? `${process.env.PUBLIC_API_URL}/webhooks/twilio/voice` : undefined,
        )
      : new FakeVoiceGateway()
  logger.info('comms.adapter', { adapter: accountSid && authToken ? 'twilio' : 'fake' })

  const endpoint = process.env.S3_ENDPOINT
  const bucket = process.env.S3_BUCKET
  const accessKey = process.env.S3_ACCESS_KEY
  const secretKey = process.env.S3_SECRET_KEY
  const storage =
    endpoint && bucket && accessKey && secretKey
      ? new S3ObjectStorage(bucket, endpoint, accessKey, secretKey, logger)
      : new MemoryObjectStorage()
  if (!(storage instanceof S3ObjectStorage)) logger.warn('storage.memory', {})

  const limit = Number(process.env.SMS_RATE_LIMIT_PER_MINUTE ?? 30)
  let rateLimiter: RateLimiter
  let queue: JobEnqueuer
  if (process.env.REDIS_URL) {
    const connection = trackRedis(new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null }), logger)
    const queueConnection = trackRedis(connection.duplicate(), logger)
    const enqueuer = new BullJobEnqueuer(queueConnection)
    shutdownSteps.push(async () => {
      await enqueuer.close()
    })
    shutdownSteps.push(async () => {
      await queueConnection.quit()
      await connection.quit()
    })
    rateLimiter = new RedisRateLimiter(connection, Number.isFinite(limit) ? limit : 30)
    queue = enqueuer
  } else {
    logger.warn('queue.unavailable', {})
    rateLimiter = new MemoryRateLimiter(Number.isFinite(limit) ? limit : 30)
    queue = {
      async enqueue() {
        throw Errors.unavailable('La cola no está disponible')
      },
    }
  }

  return createAppContext({
    store: new PrismaStore(prisma),
    messages,
    voice,
    storage,
    queue,
    rateLimiter,
    logger,
    authSecret,
    fromNumber,
  })
}
