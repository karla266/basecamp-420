import 'reflect-metadata'
import { resolve } from 'node:path'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { config } from 'dotenv'
import { AppModule } from './app.module'
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
}

void bootstrap()
