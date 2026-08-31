/**
 * The prototype's "now".
 *
 * The assessment fixes a fictional clock so that availability and workflow
 * behaviour stay deterministic. Nothing in this codebase calls `Date.now()`
 * directly — every time-dependent rule reads it from here, which is also what
 * makes the availability tests reproducible.
 *
 * Production would replace this with the real clock, injected the same way.
 */
export const FIXTURE_CLOCK_ISO = '2027-01-15T09:00:00Z'

export function now(): Date {
  return new Date(FIXTURE_CLOCK_ISO)
}

/** The fixture clock as a calendar date, e.g. "2027-01-15". */
export function today(): string {
  return FIXTURE_CLOCK_ISO.slice(0, 10)
}
