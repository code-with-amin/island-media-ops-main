import { execSync } from 'node:child_process'
import { TEST_DATABASE_URL } from './helpers/testDb'

/**
 * Applies the committed migrations to the test database once, before any
 * integration test runs. Deliberately the same command the deploy uses, so a
 * migration that would fail in production fails here first.
 */
export default function setup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  })
}
