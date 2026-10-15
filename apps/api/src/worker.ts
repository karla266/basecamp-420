import 'reflect-metadata'
import { resolve } from 'node:path'
import { prisma } from '@basecamp/db'
import { Queue, Worker } from 'bullmq'
import { config } from 'dotenv'
import IORedis from 'ioredis'
import { closeProductionResources, createProductionContext } from './context'
import { dispatchJob } from './queue/dispatch'
import { QUEUE_NAMES } from './queue/queue'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

function logError(event: string, error: unknown, extra?: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      level: 'error',
      event,
      error: error instanceof Error ? error.name : 'Error',
      ...extra,
    }),
  )
}

async function bootstrap(): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.log(JSON.stringify({ level: 'warn', event: 'worker.idle' }))
    return
  }
  const app = createProductionContext()
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  connection.on('error', (error: Error) => {
    logError('redis.error', error)
  })
  const workers = QUEUE_NAMES.map((name) => {
    const worker = new Worker(
      name,
      async (job) => {
        await dispatchJob(app, { queue: name, data: job.data as Record<string, unknown> })
      },
      { connection },
    )
    worker.on('error', (error: Error) => {
      logError('worker.error', error, { queue: name })
    })
    worker.on('failed', (job, error) => {
      logError('worker.job_failed', error, { queue: name, jobId: job?.id })
    })
    return worker
  })
  const ticks = new Queue('automations.tick', { connection })
  ticks.on('error', (error: Error) => {
    logError('queue.error', error, { queue: 'automations.tick' })
  })
  await ticks.add('tick', {}, { repeat: { every: 15_000 }, jobId: 'automations-tick' })
  const shutdown = async () => {
    try {
      await Promise.all(workers.map((worker) => worker.close()))
      await ticks.close()
    } catch (error) {
      logError('worker.shutdown_failed', error)
    }
    try {
      await connection.quit()
    } catch (error) {
      logError('worker.shutdown_failed', error)
    }
    await closeProductionResources()
    try {
      await prisma.$disconnect()
    } catch (error) {
      logError('worker.shutdown_failed', error)
    }
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

void bootstrap()
