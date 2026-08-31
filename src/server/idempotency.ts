import type { PrismaClient } from '@prisma/client'

/**
 * Idempotent creates.
 *
 * A material create — submitting a booking request, issuing a contract —
 * carries an Idempotency-Key. Repeating a request with the same key must
 * return the record already created rather than creating a second one, which
 * is what makes a retry over a flaky connection safe.
 *
 * The key is the identity of the attempt, not a hash of the body: a retry
 * that carries an edited payload still returns the original record. The
 * alternative, treating a changed body as a new request, silently duplicates
 * work exactly when the client is least sure what happened.
 */
export async function findExistingEntityId(
  prisma: PrismaClient,
  scope: string,
  key: string,
): Promise<string | null> {
  const record = await prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } })
  return record?.entityId ?? null
}

/** Prisma's unique-constraint violation, raised when two requests race. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  )
}
