import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { prisma } from '@basecamp/db'
import { hashPassword } from '@basecamp/shared'
import { config } from 'dotenv'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password || password.length < 8) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required')
  }
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(JSON.stringify({ level: 'info', event: 'seed.skipped' }))
    return
  }
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Administración',
      passwordHash: hashPassword(password),
      memberships: {
        create: { id: randomUUID(), role: 'platform_admin' },
      },
    },
  })
  console.log(JSON.stringify({ level: 'info', event: 'seed.created', userId: user.id }))
}

main()
  .catch((error: unknown) => {
    const name = error instanceof Error ? error.name : 'Error'
    console.error(JSON.stringify({ level: 'error', event: 'seed.failed', error: name }))
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
