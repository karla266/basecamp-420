import 'reflect-metadata'
import { resolve } from 'node:path'
import { Queue, Worker } from 'bullmq'
import { config } from 'dotenv'
import IORedis from 'ioredis'
import { createProductionContext } from './context'
import { dispatchJob } from './queue/dispatch'
import { QUEUE_NAMES } from './queue/queue'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

async function bootstrap(): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.log(JSON.stringify({ level: 'warn', event: 'worker.idle' }))
    return
  }
  const app = createProductionContext()
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  connection.on('error', () => undefined)
  const workers = QUEUE_NAMES.map(
    (name) =>
      new Worker(
        name,
        async (job) => {
          await dispatchJob(app, { queue: name, data: job.data as Record<string, unknown> })
        },
        { connection },
      ),
  )
  const ticks = new Queue('automations.tick', { connection })
  await ticks.add('tick', {}, { repeat: { every: 15_000 }, jobId: 'automations-tick' })
  const shutdown = async () => {
    await Promise.all(workers.map((worker) => worker.close()))
    await connection.quit()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

void bootstrap()
