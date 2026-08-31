import type { ReactNode } from 'react'

/**
 * Shared primitives.
 *
 * Every one of these appears in all three interfaces. Management and the
 * portal use them at desktop density; the field app uses the same components
 * with larger touch targets. That is the whole strategy for keeping three
 * surfaces consistent without three component libraries.
 */

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

// ------------------------------------------------------------------- status

type Tone = 'neutral' | 'positive' | 'caution' | 'critical' | 'info'

const TONE: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  positive: 'bg-positive-soft text-positive',
  caution: 'bg-caution-soft text-caution',
  critical: 'bg-critical-soft text-critical',
  info: 'bg-info-soft text-info',
}

/**
 * How every status in the system reads. Defined once so a contract that is
 * "issued" looks identical to a manager and to the client it was issued to.
 */
const STATUS_TONE: Record<string, Tone> = {
  // Requests
  submitted: 'info',
  information_required: 'caution',
  approved: 'positive',
  declined: 'critical',
  // Contracts
  draft: 'neutral',
  issued: 'info',
  change_requested: 'caution',
  accepted: 'positive',
  active: 'positive',
  completed: 'neutral',
  cancelled: 'critical',
  // Work orders
  assigned: 'info',
  travelling: 'info',
  on_site: 'caution',
  blocked: 'critical',
  // Campaigns
  awaiting_contract_acceptance: 'caution',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-chip px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE[STATUS_TONE[status] ?? 'neutral'],
        className,
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: Tone
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-chip px-2 py-0.5 text-xs font-medium',
        TONE[tone],
      )}
    >
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ surfaces

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return (
    <Tag className={cx('rounded-card border border-ink-200 bg-surface', className)}>{children}</Tag>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4 pb-3">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
      </div>
      {action}
    </div>
  )
}

/**
 * An empty state is an invitation to act, not an apology. Every one of these
 * says what is missing and what to do next.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-card border border-dashed border-ink-300 bg-surface px-6 py-10 text-center">
      <p className="font-medium text-ink-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

/**
 * Errors explain what happened and how to fix it. `details` carries the
 * specific causes the API returned, listed beneath the summary.
 */
export function ErrorNotice({
  title,
  details = [],
  className,
}: {
  title: string
  details?: string[]
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cx(
        'rounded-control border border-critical/30 bg-critical-soft px-4 py-3 text-sm',
        className,
      )}
    >
      <p className="font-medium text-critical">{title}</p>
      {details.length > 0 ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-ink-700">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone
  title: string
  children?: ReactNode
}) {
  const border = {
    neutral: 'border-ink-300 bg-ink-50',
    positive: 'border-positive/30 bg-positive-soft',
    caution: 'border-caution/30 bg-caution-soft',
    critical: 'border-critical/30 bg-critical-soft',
    info: 'border-info/30 bg-info-soft',
  }[tone]

  return (
    <div className={cx('rounded-control border px-4 py-3 text-sm', border)}>
      <p className="font-medium text-ink-900">{title}</p>
      {children ? <div className="mt-1 text-ink-700">{children}</div> : null}
    </div>
  )
}

// -------------------------------------------------------------------- fields

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-sm font-medium text-ink-800">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-ink-500">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
      {error ? <span className="mt-1 block text-xs text-critical">{error}</span> : null}
    </label>
  )
}

export const inputClass =
  'w-full rounded-control border border-ink-300 bg-surface px-3 py-2 text-sm text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-brand-500 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50'

/** Field-app inputs are taller: they are used one-handed, outdoors. */
export const inputClassLarge = inputClass.replace('py-2 text-sm', 'py-3 text-base')

// ------------------------------------------------------------------ metadata

/** A labelled fact. Values that are data — dates, money, ids — set in mono. */
export function DataPoint({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={cx('mt-0.5 text-sm text-ink-900', mono && 'font-mono tabular')}>{value}</p>
    </div>
  )
}
