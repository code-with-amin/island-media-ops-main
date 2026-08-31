/**
 * Work-order lifecycle.
 *
 * Two rules from the brief are enforced here rather than in the form or the
 * route handler, so the mobile app and the API cannot drift apart: a blocked
 * job needs a reason, and a completed job needs a note plus proof.
 *
 * Failures are returned as a list rather than the first one found, because a
 * fitter on a phone should see everything still missing in one pass.
 */

export type WorkOrderStatus =
  | 'draft'
  | 'assigned'
  | 'travelling'
  | 'on_site'
  | 'blocked'
  | 'completed'

const ALLOWED: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  draft: ['assigned'],
  assigned: ['travelling', 'on_site', 'blocked'],
  travelling: ['on_site', 'blocked'],
  on_site: ['blocked', 'completed'],
  // A blocked job resumes wherever the fitter actually is.
  blocked: ['travelling', 'on_site'],
  completed: [],
}

export interface WorkOrderTransition {
  to: WorkOrderStatus
  blockedReason?: string
  completionNote?: string
  proofCount?: number
}

export type WorkOrderTransitionResult =
  | { ok: true; status: WorkOrderStatus }
  | { ok: false; errors: string[] }

const isBlank = (value: string | undefined): boolean => !value || value.trim().length === 0

export function applyWorkOrderTransition(
  workOrder: { status: WorkOrderStatus },
  transition: WorkOrderTransition,
): WorkOrderTransitionResult {
  const { to } = transition
  const errors: string[] = []

  if (!ALLOWED[workOrder.status].includes(to)) {
    return {
      ok: false,
      errors: [`A job in status "${workOrder.status}" cannot move to "${to}".`],
    }
  }

  if (to === 'blocked' && isBlank(transition.blockedReason)) {
    errors.push('A blocked job needs a reason.')
  }

  if (to === 'completed') {
    if (isBlank(transition.completionNote)) {
      errors.push('A completed job needs a completion note.')
    }
    if ((transition.proofCount ?? 0) < 1) {
      errors.push('A completed job needs at least one proof attachment.')
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  return { ok: true, status: to }
}
