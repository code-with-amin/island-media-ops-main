import { describe, expect, test } from 'vitest'
import { applyContractAction } from './contract'

describe('applyContractAction', () => {
  test('a manager issues a draft', () => {
    const result = applyContractAction({ status: 'draft', version: 1 }, 'issue', 'manager')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('issued')
      expect(result.version).toBe(1)
    }
  })

  test('a client accepts an issued contract', () => {
    const result = applyContractAction({ status: 'issued', version: 1 }, 'accept', 'client')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe('accepted')
  })

  test('a client requests changes to an issued contract', () => {
    const result = applyContractAction({ status: 'issued', version: 1 }, 'request_change', 'client')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe('change_requested')
  })

  test('requesting changes does not alter the contract version', () => {
    // The issued version stands until a manager re-issues. A client action
    // must never silently rewrite an issued contract.
    const result = applyContractAction({ status: 'issued', version: 3 }, 'request_change', 'client')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.version).toBe(3)
  })

  test('re-issuing after a change request increments the version', () => {
    const result = applyContractAction(
      { status: 'change_requested', version: 1 },
      'issue',
      'manager',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('issued')
      expect(result.version).toBe(2)
    }
  })

  test('an accepted contract activates', () => {
    const result = applyContractAction({ status: 'accepted', version: 1 }, 'activate', 'system')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe('active')
  })

  test('an active contract completes', () => {
    const result = applyContractAction({ status: 'active', version: 1 }, 'complete', 'manager')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe('completed')
  })

  test('a client cannot accept a contract that was never issued', () => {
    const result = applyContractAction({ status: 'draft', version: 1 }, 'accept', 'client')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/draft/i)
  })

  test('a client cannot issue a contract to themselves', () => {
    const result = applyContractAction({ status: 'draft', version: 1 }, 'issue', 'client')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/client/i)
  })

  test('a manager cannot accept on the client behalf', () => {
    const result = applyContractAction({ status: 'issued', version: 1 }, 'accept', 'manager')
    expect(result.ok).toBe(false)
  })

  test('a completed contract is terminal', () => {
    const result = applyContractAction({ status: 'completed', version: 1 }, 'cancel', 'manager')
    expect(result.ok).toBe(false)
  })

  test('a cancelled contract is terminal', () => {
    const result = applyContractAction({ status: 'cancelled', version: 1 }, 'accept', 'client')
    expect(result.ok).toBe(false)
  })

  test('a manager can cancel an issued contract', () => {
    const result = applyContractAction({ status: 'issued', version: 1 }, 'cancel', 'manager')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe('cancelled')
  })
})
