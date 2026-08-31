/**
 * The availability engine.
 *
 * Pure functions over plain data — no database, no clock of its own. Callers
 * pass the candidate rows and the current time, which is what makes the seeded
 * scenarios reproducible in a unit test and lets the same code answer a
 * catalogue search, an approval recheck and a contract activation recheck.
 *
 * Two allocation models, deliberately kept apart because they fail for
 * different reasons and a manager needs to be told which:
 *
 *   exclusive_asset — one named bus, door, van or screen. Available when at
 *                     least one active asset is entirely clear.
 *   capacity_pool   — shared capacity such as a digital loop. Available when
 *                     PEAK concurrent usage stays below the pool capacity.
 */
import { overlaps, rangeLengthDays, type DateRange } from './dates'

export type BlockedBy = 'retired' | 'booking' | 'hold' | 'outage'

export interface AvailabilityAsset {
  id: string
  name: string
  status: string
}

export interface AvailabilityBooking {
  id: string
  assetId: string | null
  status: string
  startDate: string
  endDate: string
  capacityUnits?: number | null
}

export interface AvailabilityHold {
  id: string
  assetId: string | null
  status: string
  startDate: string
  endDate: string
  capacityUnits: number | null
  expiresAt: Date
}

export interface AvailabilityOutage {
  id: string
  assetId: string
  status: string
  startDate: string
  endDate: string
}

/**
 * A hold blocks inventory only while it is unexpired. An expired hold is left
 * in the data — it is history, not a mistake — but it must not block anything.
 */
export function isBlockingHold(hold: AvailabilityHold, now: Date): boolean {
  return hold.status === 'active' && hold.expiresAt.getTime() > now.getTime()
}

/**
 * Why an asset cannot be used, as a readable clause.
 *
 * Lives in the domain rather than the interface because a manager, a client
 * and an API error should all be told the same thing in the same words.
 */
export function blockedReasonLabel(blockedBy: BlockedBy): string {
  switch (blockedBy) {
    case 'retired':
      return 'is retired and cannot be booked'
    case 'booking':
      return 'has a confirmed booking for these dates'
    case 'hold':
      return 'is under an active hold for these dates'
    case 'outage':
      return 'has a confirmed outage for these dates'
  }
}

const isBlockingBooking = (b: AvailabilityBooking) => b.status === 'confirmed'
const isBlockingOutage = (o: AvailabilityOutage) => o.status === 'confirmed'

// ------------------------------------------------------------ exclusive asset

/** One record standing in the way, with the dates it covers. */
export interface Blocker {
  type: BlockedBy
  recordId: string
  startDate: string
  endDate: string
}

export interface AssetCandidate {
  assetId: string
  assetName: string
  available: boolean
  /** The first reason this asset cannot be used. Undefined when available. */
  blockedBy?: BlockedBy
  /** The id of the booking, hold or outage responsible. */
  blockedByRecordId?: string
  /**
   * Every overlapping record, in date order. The interface draws these as
   * spans so a manager can see that a window clears two days after the one
   * requested, rather than only that it is unavailable.
   */
  blockers: Blocker[]
}

export interface ExclusiveAvailabilityResult {
  allocationModel: 'exclusive_asset'
  available: boolean
  candidates: AssetCandidate[]
  availableAssetIds: string[]
}

export function exclusiveAssetAvailability(input: {
  range: DateRange
  now: Date
  assets: AvailabilityAsset[]
  bookings: AvailabilityBooking[]
  holds: AvailabilityHold[]
  outages: AvailabilityOutage[]
}): ExclusiveAvailabilityResult {
  const { range, now, assets, bookings, holds, outages } = input

  const candidates = assets.map<AssetCandidate>((asset) => {
    const base = { assetId: asset.id, assetName: asset.name }

    if (asset.status !== 'active') {
      // A retired asset has no spans to draw: it is unavailable for every
      // date, not for a particular window.
      return { ...base, available: false, blockedBy: 'retired', blockers: [] }
    }

    const blockers: Blocker[] = [
      ...bookings
        .filter((b) => b.assetId === asset.id && isBlockingBooking(b) && overlaps(b, range))
        .map<Blocker>((b) => ({
          type: 'booking',
          recordId: b.id,
          startDate: b.startDate,
          endDate: b.endDate,
        })),
      ...holds
        .filter((h) => h.assetId === asset.id && isBlockingHold(h, now) && overlaps(h, range))
        .map<Blocker>((h) => ({
          type: 'hold',
          recordId: h.id,
          startDate: h.startDate,
          endDate: h.endDate,
        })),
      ...outages
        .filter((o) => o.assetId === asset.id && isBlockingOutage(o) && overlaps(o, range))
        .map<Blocker>((o) => ({
          type: 'outage',
          recordId: o.id,
          startDate: o.startDate,
          endDate: o.endDate,
        })),
    ].sort((a, b) => (a.startDate === b.startDate ? 0 : a.startDate < b.startDate ? -1 : 1))

    const first = blockers[0]
    if (first) {
      return {
        ...base,
        available: false,
        blockedBy: first.type,
        blockedByRecordId: first.recordId,
        blockers,
      }
    }

    return { ...base, available: true, blockers: [] }
  })

  const availableAssetIds = candidates.filter((c) => c.available).map((c) => c.assetId)

  return {
    allocationModel: 'exclusive_asset',
    available: availableAssetIds.length > 0,
    candidates,
    availableAssetIds,
  }
}

// ------------------------------------------------------------- capacity pool

export interface PoolAvailabilityResult {
  allocationModel: 'capacity_pool'
  available: boolean
  capacity: number
  /** Highest number of units in use at any single moment inside the range. */
  peakUsed: number
  remaining: number
}

/**
 * Peak concurrent usage across the requested range, by sweep line.
 *
 * Summing the units of every overlapping booking is the obvious implementation
 * and it is wrong: two bookings that never coincide would be counted together
 * and the pool reported as fuller than it is. Only simultaneous usage competes
 * for capacity, so the units are swept in date order and the maximum retained.
 */
export function capacityPoolAvailability(input: {
  range: DateRange
  now: Date
  capacity: number
  bookings: AvailabilityBooking[]
  holds: AvailabilityHold[]
}): PoolAvailabilityResult {
  const { range, now, capacity, bookings, holds } = input

  const usages: { startDate: string; endDate: string; units: number }[] = [
    ...bookings
      .filter((b) => isBlockingBooking(b) && overlaps(b, range))
      .map((b) => ({ startDate: b.startDate, endDate: b.endDate, units: b.capacityUnits ?? 1 })),
    ...holds
      .filter((h) => isBlockingHold(h, now) && overlaps(h, range))
      .map((h) => ({ startDate: h.startDate, endDate: h.endDate, units: h.capacityUnits ?? 1 })),
  ]

  // Clip each usage to the requested window so capacity consumed outside it is
  // not counted, then emit a delta at each boundary.
  const deltas: { at: string; change: number }[] = []
  for (const u of usages) {
    const start = u.startDate < range.startDate ? range.startDate : u.startDate
    const end = u.endDate > range.endDate ? range.endDate : u.endDate
    if (start >= end) continue
    deltas.push({ at: start, change: u.units })
    deltas.push({ at: end, change: -u.units })
  }

  // Releases are applied before acquisitions on the same day: a booking ending
  // on the day another starts frees its unit first, because the range it holds
  // is half-open.
  deltas.sort((a, b) => (a.at === b.at ? a.change - b.change : a.at < b.at ? -1 : 1))

  let running = 0
  let peakUsed = 0
  for (const d of deltas) {
    running += d.change
    if (running > peakUsed) peakUsed = running
  }

  return {
    allocationModel: 'capacity_pool',
    available: peakUsed < capacity,
    capacity,
    peakUsed,
    remaining: Math.max(0, capacity - peakUsed),
  }
}

// -------------------------------------------------------------- minimum term

/** Whether the requested range is at least as long as the product's minimum. */
export function meetsMinimumTerm(range: DateRange, minimumTermDays: number): boolean {
  return rangeLengthDays(range) >= minimumTermDays
}

// ------------------------------------------------------------------- spans

/**
 * The periods inside the requested window when an asset is NOT usable, merged
 * and clipped to the window.
 *
 * Over a long search these are usually few and short, which makes them the
 * more useful half to describe: "free except 1–28 February" is complete and
 * exact, where "free until 1 February, and again later" leaves the reader
 * guessing when "later" is.
 */
export function blockedSpans(
  candidate: Pick<AssetCandidate, 'blockers'>,
  range: DateRange,
): DateRange[] {
  const clipped = candidate.blockers
    .map((b) => ({
      startDate: b.startDate < range.startDate ? range.startDate : b.startDate,
      endDate: b.endDate > range.endDate ? range.endDate : b.endDate,
    }))
    .filter((b) => b.startDate < b.endDate)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))

  const merged: DateRange[] = []
  for (const block of clipped) {
    const last = merged[merged.length - 1]
    // Touching spans merge too: half-open, so there is no free day between a
    // block ending on the 1st and another starting on the 1st.
    if (last && block.startDate <= last.endDate) {
      if (block.endDate > last.endDate) last.endDate = block.endDate
    } else {
      merged.push({ ...block })
    }
  }

  return merged
}

/**
 * The periods inside the requested window when an asset IS free.
 *
 * The inverse of blockedSpans, and the half a person needs when an asset is
 * mostly booked rather than mostly free.
 */
export function freeSpans(
  candidate: Pick<AssetCandidate, 'blockers' | 'blockedBy'>,
  range: DateRange,
): DateRange[] {
  // A retired asset is unavailable for every date, not for a period.
  if (candidate.blockedBy === 'retired') return []

  const spans: DateRange[] = []
  let cursor = range.startDate

  for (const block of blockedSpans(candidate, range)) {
    if (cursor < block.startDate) {
      spans.push({ startDate: cursor, endDate: block.startDate })
    }
    if (block.endDate > cursor) cursor = block.endDate
  }
  if (cursor < range.endDate) spans.push({ startDate: cursor, endDate: range.endDate })

  return spans
}
