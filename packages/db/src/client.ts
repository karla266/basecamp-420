import { PrismaClient, type Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const client = new PrismaClient({
    log: [{ emit: 'event', level: 'error' }],
  });
  client.$on('error', (event: Prisma.LogEvent) => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'prisma.error',
        target: event.target,
        time: new Date().toISOString(),
      }),
    );
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
