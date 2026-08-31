/**
 * Contract lifecycle.
 *
 * The rule this exists to enforce: a client action must not silently rewrite
 * an issued contract. Accepting or requesting a change moves the status and
 * appends history; only a manager re-issuing produces a new version. Terms,
 * dates, items and totals are never touched here — this function returns a
 * status and a version, and nothing else.
 */

export type ContractStatus =
  | 'draft'
  | 'issued'
  | 'change_requested'
  | 'accepted'
  | 'active'
  | 'completed'
  | 'cancelled'

export type ContractAction =
  | 'issue'
  | 'accept'
  | 'request_change'
  | 'activate'
  | 'complete'
  | 'cancel'

export type Actor = 'manager' | 'client' | 'system' | 'fitter'

interface Rule {
  from: ContractStatus[]
  to: ContractStatus
  actors: Actor[]
  /** Human phrasing for rejection messages, which reach the interface. */
  verb: string
  /** Re-issuing after a change request produces a new version of the offer. */
  bumpsVersionFrom?: ContractStatus[]
}

const RULES: Record<ContractAction, Rule> = {
  issue: {
    from: ['draft', 'change_requested'],
    to: 'issued',
    actors: ['manager'],
    verb: 'issue',
    bumpsVersionFrom: ['change_requested'],
  },
  accept: { from: ['issued'], to: 'accepted', actors: ['client'], verb: 'accept' },
  request_change: {
    from: ['issued'],
    to: 'change_requested',
    actors: ['client'],
    verb: 'request changes to',
  },
  activate: { from: ['accepted'], to: 'active', actors: ['system', 'manager'], verb: 'activate' },
  complete: { from: ['active'], to: 'completed', actors: ['manager', 'system'], verb: 'complete' },
  cancel: {
    from: ['draft', 'issued', 'change_requested', 'accepted', 'active'],
    to: 'cancelled',
    actors: ['manager'],
    verb: 'cancel',
  },
}

export type ContractActionResult =
  | { ok: true; status: ContractStatus; version: number }
  | { ok: false; reason: string }

export function applyContractAction(
  contract: { status: ContractStatus; version: number },
  action: ContractAction,
  actor: Actor,
): ContractActionResult {
  const rule = RULES[action]

  if (!rule.actors.includes(actor)) {
    return { ok: false, reason: `A ${actor} cannot ${rule.verb} a contract.` }
  }

  if (!rule.from.includes(contract.status)) {
    return {
      ok: false,
      reason: `You cannot ${rule.verb} a contract that is in status "${contract.status}".`,
    }
  }

  const bump = rule.bumpsVersionFrom?.includes(contract.status) ?? false

  return { ok: true, status: rule.to, version: contract.version + (bump ? 1 : 0) }
}
