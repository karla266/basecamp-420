import 'reflect-metadata'
import { resolve } from 'node:path'
import { prisma } from '@basecamp/db'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { config } from 'dotenv'
import { AppModule } from './app.module'
import { closeProductionResources } from './context'
import { AppExceptionFilter } from './http/http'
import { requestIdMiddleware } from './http/request-id'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.use(requestIdMiddleware)
  app.use(cookieParser())
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  })
  app.useGlobalFilters(app.get(AppExceptionFilter))
  await app.listen(process.env.API_PORT ?? process.env.PORT ?? 3001)
  const shutdown = async () => {
    try {
      await app.close()
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'api.shutdown_failed',
          error: error instanceof Error ? error.name : 'Error',
        }),
      )
    }
    await closeProductionResources()
    try {
      await prisma.$disconnect()
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'api.shutdown_failed',
          error: error instanceof Error ? error.name : 'Error',
        }),
      )
    }
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

void bootstrap()
