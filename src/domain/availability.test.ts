import { describe, expect, test } from 'vitest'
import {
  blockedReasonLabel,
  exclusiveAssetAvailability,
  blockedSpans,
  freeSpans,
  capacityPoolAvailability,
  meetsMinimumTerm,
  type AvailabilityAsset,
  type AvailabilityBooking,
  type AvailabilityHold,
  type AvailabilityOutage,
} from './availability'

const NOW = new Date('2027-01-15T09:00:00Z')

const active = (id: string): AvailabilityAsset => ({ id, name: id, status: 'active' })

// ------------------------------------------------------------ exclusive asset

describe('exclusiveAssetAvailability', () => {
  test('is available when at least one asset is clear', () => {
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-02-12', endDate: '2027-02-18' },
      now: NOW,
      assets: [active('asset-a'), active('asset-b')],
      bookings: [
        {
          id: 'b1',
          assetId: 'asset-a',
          status: 'confirmed',
          startDate: '2027-02-01',
          endDate: '2027-03-01',
        },
      ],
      holds: [],
      outages: [],
    })

    expect(result.available).toBe(true)
    expect(result.availableAssetIds).toEqual(['asset-b'])
  })

  test('reproduces the seeded conflict: every bus rear panel is blocked', () => {
    // Bus 101 booked across the window, bus 102 booked from part-way through,
    // bus 103 under a confirmed outage. This is the request-001 case.
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-02-12', endDate: '2027-02-18' },
      now: NOW,
      assets: [active('bus-101'), active('bus-102'), active('bus-103')],
      bookings: [
        {
          id: 'booking-001',
          assetId: 'bus-101',
          status: 'confirmed',
          startDate: '2027-02-01',
          endDate: '2027-03-01',
        },
        {
          id: 'booking-002',
          assetId: 'bus-102',
          status: 'confirmed',
          startDate: '2027-02-15',
          endDate: '2027-04-01',
        },
      ],
      holds: [],
      outages: [
        {
          id: 'outage-001',
          assetId: 'bus-103',
          status: 'confirmed',
          startDate: '2027-02-10',
          endDate: '2027-02-20',
        },
      ],
    })

    expect(result.available).toBe(false)
    expect(result.availableAssetIds).toEqual([])
    expect(result.candidates.map((c) => c.blockedBy)).toEqual(['booking', 'booking', 'outage'])
  })

  test('a booking ending on the requested start date does not block', () => {
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-03-01', endDate: '2027-04-01' },
      now: NOW,
      assets: [active('asset-a')],
      bookings: [
        {
          id: 'b1',
          assetId: 'asset-a',
          status: 'confirmed',
          startDate: '2027-02-01',
          endDate: '2027-03-01',
        },
      ],
      holds: [],
      outages: [],
    })

    expect(result.available).toBe(true)
  })

  test('a retired asset is never a candidate', () => {
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-08-01', endDate: '2027-09-01' },
      now: NOW,
      assets: [{ id: 'bus-202', name: 'Bus 202 full wrap', status: 'retired' }],
      bookings: [],
      holds: [],
      outages: [],
    })

    expect(result.available).toBe(false)
    expect(result.candidates[0]?.blockedBy).toBe('retired')
  })

  test('a cancelled booking does not block', () => {
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-02-12', endDate: '2027-02-18' },
      now: NOW,
      assets: [active('asset-a')],
      bookings: [
        {
          id: 'b1',
          assetId: 'asset-a',
          status: 'cancelled',
          startDate: '2027-02-01',
          endDate: '2027-03-01',
        },
      ],
      holds: [],
      outages: [],
    })

    expect(result.available).toBe(true)
  })

  test('an active hold blocks the asset', () => {
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-03-05', endDate: '2027-03-15' },
      now: NOW,
      assets: [active('bus-103')],
      bookings: [],
      holds: [
        {
          id: 'hold-003',
          assetId: 'bus-103',
          status: 'active',
          capacityUnits: null,
          startDate: '2027-03-05',
          endDate: '2027-03-15',
          expiresAt: new Date('2027-01-18T12:00:00Z'), // after the clock
        },
      ],
      outages: [],
    })

    expect(result.available).toBe(false)
    expect(result.candidates[0]?.blockedBy).toBe('hold')
  })

  test('an expired hold does not block the asset', () => {
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-03-05', endDate: '2027-03-15' },
      now: NOW,
      assets: [active('bus-103')],
      bookings: [],
      holds: [
        {
          id: 'hold-expired',
          assetId: 'bus-103',
          status: 'active',
          capacityUnits: null,
          startDate: '2027-03-05',
          endDate: '2027-03-15',
          expiresAt: new Date('2027-01-10T17:00:00Z'), // before the clock
        },
      ],
      outages: [],
    })

    expect(result.available).toBe(true)
  })
})

// ------------------------------------------------------------- capacity pool

const poolBooking = (
  id: string,
  startDate: string,
  endDate: string,
  capacityUnits: number,
): AvailabilityBooking => ({
  id,
  assetId: null,
  status: 'confirmed',
  startDate,
  endDate,
  capacityUnits,
})

const poolHold = (
  id: string,
  startDate: string,
  endDate: string,
  capacityUnits: number,
  expiresAt: string,
): AvailabilityHold => ({
  id,
  assetId: null,
  status: 'active',
  startDate,
  endDate,
  capacityUnits,
  expiresAt: new Date(expiresAt),
})

describe('capacityPoolAvailability', () => {
  test('is available while peak usage is below capacity', () => {
    const result = capacityPoolAvailability({
      range: { startDate: '2027-02-01', endDate: '2027-02-10' },
      now: NOW,
      capacity: 4,
      bookings: [poolBooking('booking-006', '2027-02-01', '2027-03-01', 1)],
      holds: [],
    })

    expect(result.available).toBe(true)
    expect(result.peakUsed).toBe(1)
    expect(result.remaining).toBe(3)
  })

  test('reproduces the seeded pool: full over 20-28 February', () => {
    // Three confirmed bookings plus one active hold coincide over this window.
    const result = capacityPoolAvailability({
      range: { startDate: '2027-02-20', endDate: '2027-02-28' },
      now: NOW,
      capacity: 4,
      bookings: [
        poolBooking('booking-006', '2027-02-01', '2027-03-01', 1),
        poolBooking('booking-007', '2027-02-15', '2027-03-15', 1),
        poolBooking('booking-008', '2027-02-20', '2027-02-28', 1),
      ],
      holds: [poolHold('hold-001', '2027-02-10', '2027-03-01', 1, '2027-01-20T17:00:00Z')],
    })

    expect(result.peakUsed).toBe(4)
    expect(result.remaining).toBe(0)
    expect(result.available).toBe(false)
  })

  test('an expired hold does not consume capacity', () => {
    // hold-002 is identical to hold-001 but expired five days before the
    // clock. Counting it would report 5 of 4 units used, which is impossible.
    const result = capacityPoolAvailability({
      range: { startDate: '2027-02-20', endDate: '2027-02-28' },
      now: NOW,
      capacity: 4,
      bookings: [
        poolBooking('booking-006', '2027-02-01', '2027-03-01', 1),
        poolBooking('booking-007', '2027-02-15', '2027-03-15', 1),
        poolBooking('booking-008', '2027-02-20', '2027-02-28', 1),
      ],
      holds: [
        poolHold('hold-001', '2027-02-10', '2027-03-01', 1, '2027-01-20T17:00:00Z'),
        poolHold('hold-002', '2027-02-10', '2027-03-01', 1, '2027-01-10T17:00:00Z'),
      ],
    })

    expect(result.peakUsed).toBe(4)
    expect(result.available).toBe(false)
  })

  test('measures peak concurrent usage, not the sum of overlapping bookings', () => {
    // Two bookings of two units that never coincide. Summing gives 4 and would
    // wrongly report the pool as full; the true peak is 2.
    const result = capacityPoolAvailability({
      range: { startDate: '2027-02-01', endDate: '2027-03-01' },
      now: NOW,
      capacity: 3,
      bookings: [
        poolBooking('early', '2027-02-01', '2027-02-10', 2),
        poolBooking('late', '2027-02-10', '2027-02-20', 2),
      ],
      holds: [],
    })

    expect(result.peakUsed).toBe(2)
    expect(result.available).toBe(true)
  })

  test('usage outside the requested range is ignored', () => {
    const result = capacityPoolAvailability({
      range: { startDate: '2027-06-01', endDate: '2027-06-15' },
      now: NOW,
      capacity: 4,
      bookings: [poolBooking('booking-006', '2027-02-01', '2027-03-01', 1)],
      holds: [],
    })

    expect(result.peakUsed).toBe(0)
    expect(result.available).toBe(true)
  })

  test('a booking with no explicit units counts as one', () => {
    const result = capacityPoolAvailability({
      range: { startDate: '2027-02-01', endDate: '2027-02-10' },
      now: NOW,
      capacity: 1,
      bookings: [
        { id: 'b', assetId: null, status: 'confirmed', startDate: '2027-02-01', endDate: '2027-02-10' },
      ],
      holds: [],
    })

    expect(result.peakUsed).toBe(1)
    expect(result.available).toBe(false)
  })
})

// ------------------------------------------------------------ minimum term

describe('meetsMinimumTerm', () => {
  test('rejects a six-day request against a thirty-day minimum', () => {
    // The seeded request-001 asks for 12-18 February on a product with a
    // 30-day minimum term.
    expect(
      meetsMinimumTerm({ startDate: '2027-02-12', endDate: '2027-02-18' }, 30),
    ).toBe(false)
  })

  test('accepts a request at exactly the minimum term', () => {
    expect(
      meetsMinimumTerm({ startDate: '2027-02-01', endDate: '2027-03-03' }, 30),
    ).toBe(true)
  })
})

// ------------------------------------------------------------ blocked labels

describe('blockedReasonLabel', () => {
  test('reads as a sentence for every blocking cause', () => {
    // These strings reach a manager on the approval screen, so they have to be
    // readable English rather than an enum value with an article glued on.
    expect(`Bus 103 rear ${blockedReasonLabel('outage')}.`).toBe(
      'Bus 103 rear has a confirmed outage for these dates.',
    )
    expect(`Bus 101 rear ${blockedReasonLabel('booking')}.`).toBe(
      'Bus 101 rear has a confirmed booking for these dates.',
    )
    expect(`Bus 103 rear ${blockedReasonLabel('hold')}.`).toBe(
      'Bus 103 rear is under an active hold for these dates.',
    )
    expect(`Bus 202 full wrap ${blockedReasonLabel('retired')}.`).toBe(
      'Bus 202 full wrap is retired and cannot be booked.',
    )
  })
})

// -------------------------------------------------------------- blocker spans

describe('blocker spans', () => {
  test('reports every blocking record with its dates, not just the first', () => {
    // The approval screen needs to show WHEN an asset is blocked, so a manager
    // can see that a window clears two days after the one requested.
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-02-01', endDate: '2027-03-01' },
      now: NOW,
      assets: [active('bus-103')],
      bookings: [
        {
          id: 'booking-x',
          assetId: 'bus-103',
          status: 'confirmed',
          startDate: '2027-02-01',
          endDate: '2027-02-05',
        },
      ],
      holds: [],
      outages: [
        {
          id: 'outage-001',
          assetId: 'bus-103',
          status: 'confirmed',
          startDate: '2027-02-10',
          endDate: '2027-02-20',
        },
      ],
    })

    const blockers = result.candidates[0]?.blockers ?? []
    expect(blockers).toHaveLength(2)
    expect(blockers.map((b) => b.type)).toEqual(['booking', 'outage'])
    expect(blockers[1]).toMatchObject({
      recordId: 'outage-001',
      startDate: '2027-02-10',
      endDate: '2027-02-20',
    })
  })

  test('an available asset has no blockers', () => {
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-02-01', endDate: '2027-03-01' },
      now: NOW,
      assets: [active('bus-101')],
      bookings: [],
      holds: [],
      outages: [],
    })

    expect(result.candidates[0]?.blockers).toEqual([])
  })

  test('an expired hold is not reported as a blocker', () => {
    const result = exclusiveAssetAvailability({
      range: { startDate: '2027-03-05', endDate: '2027-03-15' },
      now: NOW,
      assets: [active('bus-103')],
      bookings: [],
      holds: [
        {
          id: 'hold-expired',
          assetId: 'bus-103',
          status: 'active',
          capacityUnits: null,
          startDate: '2027-03-05',
          endDate: '2027-03-15',
          expiresAt: new Date('2027-01-10T17:00:00Z'),
        },
      ],
      outages: [],
    })

    expect(result.candidates[0]?.blockers).toEqual([])
  })
})

// ---------------------------------------------------------------- free spans

describe('freeSpans', () => {
  const window = { startDate: '2027-01-15', endDate: '2027-02-14' }

  const candidate = (blockers: { type: 'booking' | 'outage' | 'hold'; from: string; to: string }[]) => ({
    assetId: 'a',
    assetName: 'A',
    available: blockers.length === 0,
    blockers: blockers.map((b, i) => ({
      type: b.type,
      recordId: `r${i}`,
      startDate: b.from,
      endDate: b.to,
    })),
  })

  test('a clear asset is free for the whole window', () => {
    expect(freeSpans(candidate([]), window)).toEqual([window])
  })

  test('a booking starting mid-window leaves one span at the front', () => {
    // The seeded Bus 101: booked from 1 February.
    expect(freeSpans(candidate([{ type: 'booking', from: '2027-02-01', to: '2027-03-01' }]), window)).toEqual([
      { startDate: '2027-01-15', endDate: '2027-02-01' },
    ])
  })

  test('a booking ending mid-window leaves one span at the back', () => {
    expect(freeSpans(candidate([{ type: 'booking', from: '2027-01-01', to: '2027-01-25' }]), window)).toEqual([
      { startDate: '2027-01-25', endDate: '2027-02-14' },
    ])
  })

  test('a blocker in the middle leaves a span either side', () => {
    expect(
      freeSpans(candidate([{ type: 'outage', from: '2027-01-25', to: '2027-02-01' }]), window),
    ).toEqual([
      { startDate: '2027-01-15', endDate: '2027-01-25' },
      { startDate: '2027-02-01', endDate: '2027-02-14' },
    ])
  })

  test('a blocker covering the window leaves nothing', () => {
    expect(
      freeSpans(candidate([{ type: 'booking', from: '2027-01-01', to: '2027-07-01' }]), window),
    ).toEqual([])
  })

  test('overlapping blockers are merged rather than double counted', () => {
    expect(
      freeSpans(
        candidate([
          { type: 'booking', from: '2027-01-20', to: '2027-02-01' },
          { type: 'hold', from: '2027-01-25', to: '2027-02-05' },
        ]),
        window,
      ),
    ).toEqual([
      { startDate: '2027-01-15', endDate: '2027-01-20' },
      { startDate: '2027-02-05', endDate: '2027-02-14' },
    ])
  })

  test('touching blockers do not create a zero-length gap', () => {
    // One ends the day the next begins: half-open, so there is no free day.
    expect(
      freeSpans(
        candidate([
          { type: 'booking', from: '2027-01-20', to: '2027-02-01' },
          { type: 'booking', from: '2027-02-01', to: '2027-02-10' },
        ]),
        window,
      ),
    ).toEqual([
      { startDate: '2027-01-15', endDate: '2027-01-20' },
      { startDate: '2027-02-10', endDate: '2027-02-14' },
    ])
  })

  test('a retired asset has no free span even with no blockers', () => {
    const retired = { assetId: 'a', assetName: 'A', available: false, blockedBy: 'retired' as const, blockers: [] }
    expect(freeSpans(retired, window)).toEqual([])
  })
})

// ------------------------------------------------------------- blocked spans

describe('blockedSpans', () => {
  const year = { startDate: '2026-08-31', endDate: '2027-08-29' }

  const withBlockers = (blockers: { from: string; to: string }[]) => ({
    assetId: 'a',
    assetName: 'A',
    available: false,
    blockers: blockers.map((b, i) => ({
      type: 'booking' as const,
      recordId: `r${i}`,
      startDate: b.from,
      endDate: b.to,
    })),
  })

  test('a clear asset has no blocked span', () => {
    expect(blockedSpans(withBlockers([]), year)).toEqual([])
  })

  test('reports one merged, clipped span per blocked period', () => {
    // The seeded Bus 101, seen through a year-long window: booked for one
    // month out of twelve. The exception is the useful fact, not the rule.
    expect(blockedSpans(withBlockers([{ from: '2027-02-01', to: '2027-03-01' }]), year)).toEqual([
      { startDate: '2027-02-01', endDate: '2027-03-01' },
    ])
  })

  test('clips a blocker that runs past the window', () => {
    expect(blockedSpans(withBlockers([{ from: '2026-01-01', to: '2027-12-01' }]), year)).toEqual([
      year,
    ])
  })

  test('merges overlapping blockers into one span', () => {
    expect(
      blockedSpans(
        withBlockers([
          { from: '2027-02-01', to: '2027-03-01' },
          { from: '2027-02-15', to: '2027-03-10' },
        ]),
        year,
      ),
    ).toEqual([{ startDate: '2027-02-01', endDate: '2027-03-10' }])
  })

  test('keeps separate blocked periods separate', () => {
    expect(
      blockedSpans(
        withBlockers([
          { from: '2027-02-10', to: '2027-02-20' },
          { from: '2027-03-05', to: '2027-03-15' },
        ]),
        year,
      ),
    ).toEqual([
      { startDate: '2027-02-10', endDate: '2027-02-20' },
      { startDate: '2027-03-05', endDate: '2027-03-15' },
    ])
  })

  test('ignores a blocker entirely outside the window', () => {
    expect(blockedSpans(withBlockers([{ from: '2028-01-01', to: '2028-02-01' }]), year)).toEqual([])
  })
})
