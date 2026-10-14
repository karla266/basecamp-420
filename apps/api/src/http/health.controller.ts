import { prisma } from '@basecamp/db'
import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'

@Controller()
export class HealthController {
  @Get('health')
  async health(@Res({ passthrough: true }) response: Response) {
    if (!process.env.DATABASE_URL) {
      response.status(200)
      return { status: 'ok', db: 'down' }
    }
    try {
      await prisma.$queryRaw`SELECT 1`
      response.status(200)
      return { status: 'ok', db: 'up' }
    } catch {
      response.status(200)
      return { status: 'ok', db: 'down' }
    }
  }
}
