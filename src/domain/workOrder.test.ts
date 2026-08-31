import { describe, expect, test } from 'vitest'
import { applyWorkOrderTransition } from './workOrder'

describe('applyWorkOrderTransition', () => {
  test('an assigned job can start travelling', () => {
    const result = applyWorkOrderTransition({ status: 'assigned' }, { to: 'travelling' })
    expect(result.ok).toBe(true)
  })

  test('a travelling job can arrive on site', () => {
    const result = applyWorkOrderTransition({ status: 'travelling' }, { to: 'on_site' })
    expect(result.ok).toBe(true)
  })

  test('a draft job cannot start travelling before it is assigned', () => {
    const result = applyWorkOrderTransition({ status: 'draft' }, { to: 'travelling' })
    expect(result.ok).toBe(false)
  })

  describe('blocking', () => {
    test('is rejected without a reason', () => {
      const result = applyWorkOrderTransition({ status: 'on_site' }, { to: 'blocked' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors).toContain('A blocked job needs a reason.')
    })

    test('is rejected when the reason is only whitespace', () => {
      const result = applyWorkOrderTransition(
        { status: 'on_site' },
        { to: 'blocked', blockedReason: '   ' },
      )
      expect(result.ok).toBe(false)
    })

    test('is accepted with a reason', () => {
      const result = applyWorkOrderTransition(
        { status: 'on_site' },
        { to: 'blocked', blockedReason: 'Depot gate locked, no key holder on site.' },
      )
      expect(result.ok).toBe(true)
    })

    test('a blocked job can resume on site', () => {
      const result = applyWorkOrderTransition({ status: 'blocked' }, { to: 'on_site' })
      expect(result.ok).toBe(true)
    })
  })

  describe('completion', () => {
    test('is rejected without a completion note', () => {
      const result = applyWorkOrderTransition(
        { status: 'on_site' },
        { to: 'completed', proofCount: 1 },
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors).toContain('A completed job needs a completion note.')
    })

    test('is rejected without proof', () => {
      const result = applyWorkOrderTransition(
        { status: 'on_site' },
        { to: 'completed', completionNote: 'Panel fitted and photographed.', proofCount: 0 },
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors).toContain('A completed job needs at least one proof attachment.')
      }
    })

    test('reports both failures at once', () => {
      const result = applyWorkOrderTransition({ status: 'on_site' }, { to: 'completed' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors).toHaveLength(2)
    })

    test('is accepted with a note and at least one proof', () => {
      const result = applyWorkOrderTransition(
        { status: 'on_site' },
        { to: 'completed', completionNote: 'Panel fitted and photographed.', proofCount: 1 },
      )
      expect(result.ok).toBe(true)
    })

    test('a completed job is terminal', () => {
      const result = applyWorkOrderTransition({ status: 'completed' }, { to: 'on_site' })
      expect(result.ok).toBe(false)
    })
  })
})
