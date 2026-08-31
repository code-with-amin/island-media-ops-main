import { randomUUID } from 'node:crypto'

/**
 * Readable, prefixed identifiers.
 *
 * Seeded records keep the IDs supplied in the fixtures; anything created at
 * runtime gets a prefixed random ID so that a reviewer reading the database
 * can tell fixture data from data the prototype created.
 */
export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}
