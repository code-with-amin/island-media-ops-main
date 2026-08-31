import type { AssetCandidate, Blocker } from '@/domain/availability'
import { blockedSpans, freeSpans } from '@/domain/availability'
import { availabilityPhrase, formatDateShort, formatSpan } from './format'

/**
 * The availability strip.
 *
 * The hardest question in this product is "why can't I have this?", and the
 * honest answer is never a single word — three bus panels can be unavailable
 * for three different reasons on three different dates.
 *
 * Three things carry the meaning, deliberately redundant so no single one has
 * to be decoded:
 *
 *   the bar   — shape, for comparing several assets at a glance
 *   the axis  — when the state changes, which a colour alone cannot say
 *   the words — "free until 1 Feb" rather than "Booked": a decision, not a state
 *
 * Blocked segments also differ by texture, so the encoding survives being read
 * without colour.
 *
 * The same component appears in the catalogue, on a product, on the approval
 * screen and on the inventory page.
 */

const DAY_MS = 86_400_000
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Colour AND texture, so neither channel is load-bearing on its own. */
const BLOCKER_STYLE: Record<Blocker['type'], { className: string; label: string }> = {
  booking: { className: 'bg-booked', label: 'Booked' },
  hold: {
    className: 'bg-held bg-[repeating-linear-gradient(90deg,transparent_0_3px,rgba(255,255,255,.55)_3px_5px)]',
    label: 'On hold',
  },
  outage: {
    className:
      'bg-outage bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgba(255,255,255,.45)_3px_6px)]',
    label: 'Out of service',
  },
  retired: { className: 'bg-retired', label: 'Retired' },
}

function Span({
  blocker,
  windowStart,
  windowDays,
}: {
  blocker: Blocker
  windowStart: number
  windowDays: number
}) {
  // Clip to the requested window: a booking running to July should not draw
  // past the edge of a one-week search.
  const start = Math.max(dayNumber(blocker.startDate), windowStart)
  const end = Math.min(dayNumber(blocker.endDate), windowStart + windowDays)
  if (end <= start) return null

  const style = BLOCKER_STYLE[blocker.type]

  return (
    <span
      className={`absolute inset-y-0 ${style.className}`}
      style={{ left: `${((start - windowStart) / windowDays) * 100}%`, width: `${((end - start) / windowDays) * 100}%` }}
      title={`${style.label}: ${formatSpan(blocker)}`}
    />
  )
}

/**
 * Evenly spaced dates beneath the bars.
 *
 * Three ticks are enough for a month but cannot date anything inside a
 * year-long window, so longer searches get more of them.
 */
function DateAxis({ startDate, endDate }: { startDate: string; endDate: string }) {
  const days = Math.max(1, dayNumber(endDate) - dayNumber(startDate))
  const ticks = days > 240 ? 6 : days > 90 ? 5 : 3

  const marks = Array.from({ length: ticks }, (_, i) =>
    // The last tick is the final covered day, not the exclusive end date.
    i === ticks - 1 ? addDays(endDate, -1) : addDays(startDate, Math.round((days * i) / (ticks - 1))),
  )

  return (
    <div className="mt-1.5 flex items-center gap-3">
      <span className="w-36 shrink-0 sm:w-40" />
      <div className="relative flex-1">
        <div className="flex justify-between" aria-hidden>
          {marks.map((m) => (
            <span key={m} className="h-1.5 w-px bg-ink-300" />
          ))}
        </div>
        <div className="mt-0.5 flex justify-between font-mono text-[0.6875rem] tabular text-ink-500">
          {marks.map((m) => (
            <span key={m}>{formatDateShort(m)}</span>
          ))}
        </div>
      </div>
      <span className="w-32 shrink-0 sm:w-40" />
    </div>
  )
}

export function AvailabilityStrip({
  candidates,
  startDate,
  endDate,
}: {
  candidates: AssetCandidate[]
  startDate: string
  endDate: string
}) {
  const range = { startDate, endDate }
  const windowStart = dayNumber(startDate)
  const windowDays = Math.max(1, dayNumber(endDate) - windowStart)

  return (
    <div>
      <div className="space-y-1.5">
        {candidates.map((c) => {
          const phrase =
            c.blockedBy === 'retired'
              ? 'retired'
              : availabilityPhrase(blockedSpans(c, range), range)
          const freeAllPeriod = c.blockedBy !== 'retired' && c.blockers.length === 0

          return (
            <div key={c.assetId} className="flex items-center gap-3">
              <span
                className="w-36 shrink-0 truncate text-xs text-ink-600 sm:w-40"
                title={c.assetName}
              >
                {c.assetName}
              </span>

              <span
                className="relative h-3 flex-1 overflow-hidden rounded-chip bg-free/25"
                role="img"
                aria-label={`${c.assetName}: ${phrase}`}
              >
                {c.blockedBy === 'retired' ? (
                  <span className={`absolute inset-0 ${BLOCKER_STYLE.retired.className}`} />
                ) : (
                  c.blockers.map((b) => (
                    <Span
                      key={`${b.type}-${b.recordId}`}
                      blocker={b}
                      windowStart={windowStart}
                      windowDays={windowDays}
                    />
                  ))
                )}
              </span>

              <span
                className={`w-32 shrink-0 text-right text-xs sm:w-40 ${
                  freeAllPeriod ? 'font-medium text-positive' : 'text-ink-600'
                }`}
              >
                {phrase}
              </span>
            </div>
          )
        })}
      </div>

      <DateAxis startDate={startDate} endDate={endDate} />
    </div>
  )
}

/** Key for the strip. Rendered once per page, not once per strip. */
export function AvailabilityLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-chip bg-free/25" />
        Free
      </li>
      {(['booking', 'hold', 'outage', 'retired'] as const).map((t) => (
        <li key={t} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-4 rounded-chip ${BLOCKER_STYLE[t].className}`} />
          {BLOCKER_STYLE[t].label}
        </li>
      ))}
    </ul>
  )
}

/**
 * A one-line answer above the detail: how many assets exist, and how many are
 * usable. It is the thing most readers actually want, and it is deliberately
 * phrased so that "free for part of it" does not read as a failure — over a
 * long search, an asset booked for one month in twelve is mostly available,
 * and the row beside it says exactly when.
 */
export function AvailabilitySummary({
  candidates,
  startDate,
  endDate,
  noun = 'assets',
}: {
  candidates: AssetCandidate[]
  startDate: string
  endDate: string
  noun?: string
}) {
  const range = { startDate, endDate }
  const whole = candidates.filter((c) => c.blockedBy !== 'retired' && c.blockers.length === 0).length
  const partial = candidates.filter(
    (c) => c.blockedBy !== 'retired' && c.blockers.length > 0 && freeSpans(c, range).length > 0,
  ).length

  return (
    <p className="text-xs text-ink-600">
      <span className="font-medium text-ink-900">
        {candidates.length} {noun}
      </span>
      {' · '}
      {whole > 0 ? (
        <span className="font-medium text-positive">{whole} free throughout</span>
      ) : partial > 0 ? (
        <span className="font-medium text-ink-900">none free throughout</span>
      ) : (
        <span className="font-medium text-ink-900">none available</span>
      )}
      {partial > 0 ? (
        <span>
          , {partial} free apart from the dates shown
        </span>
      ) : null}
    </p>
  )
}

/** Compact capacity meter for pool products, which have no named assets. */
export function CapacityMeter({
  capacity,
  peakUsed,
}: {
  capacity: number
  peakUsed: number
}) {
  const units = Array.from({ length: Math.max(capacity, peakUsed) }, (_, i) => i)
  const free = Math.max(0, capacity - peakUsed)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="flex gap-1" role="img" aria-label={`${peakUsed} of ${capacity} slots in use`}>
        {units.map((i) => (
          <span
            key={i}
            className={`h-3 w-6 rounded-chip ${i < peakUsed ? 'bg-booked' : 'bg-free/25'}`}
          />
        ))}
      </span>
      <span className="text-xs text-ink-600">
        {free > 0 ? (
          <>
            <span className="font-medium text-positive">
              {free} of {capacity} slots free
            </span>{' '}
            at the busiest moment in your dates
          </>
        ) : (
          <>
            <span className="font-medium text-ink-900">Full</span> at the busiest moment in your
            dates ({peakUsed} of {capacity})
          </>
        )}
      </span>
    </div>
  )
}
