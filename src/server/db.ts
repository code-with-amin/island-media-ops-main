import type { PrismaClient } from '@prisma/client'
import { createPrismaClient } from './prismaClient'

/**
 * Prisma singleton.
 *
 * Next's dev server reloads modules on every change; without caching the
 * client on globalThis each reload would open a new connection pool until
 * SQLite refused them.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
