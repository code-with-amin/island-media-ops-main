'use client'

import { useState } from 'react'
import { isValidRange, rangeLengthDays } from '@/domain/dates'
import { formatDateShort } from './format'
import { inputClass } from './primitives'

/**
 * Catalogue search.
 *
 * Dates are required rather than optional, because every answer on this page
 * depends on them: a product is not available in the abstract, only for a
 * period.
 *
 * The end date is exclusive, which is the single most confusing thing on the
 * page. Rather than explain that rule in a hint nobody reads, the form shows
 * the consequence and keeps it live: pick 14 February and it tells you the
 * search covers up to the 13th, and how many days that is. An answer beats a
 * definition.
 *
 * Submitting is a plain GET, so a search is a URL a client can send to a
 * colleague or reopen a week later.
 */
export function CatalogueFilters({
  query,
  locations,
  mediaTypes,
}: {
  query: {
    startDate: string
    endDate: string
    mediaType?: string
    locationId?: string
    maxMonthlyBudget?: string
  }
  locations: { id: string; name: string }[]
  mediaTypes: string[]
}) {
  const [startDate, setStartDate] = useState(query.startDate)
  const [endDate, setEndDate] = useState(query.endDate)

  const valid = isValidRange({ startDate, endDate })
  const days = valid ? rangeLengthDays({ startDate, endDate }) : 0
  const lastDay = valid
    ? new Date(new Date(`${endDate}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)
    : null

  const label = 'mb-1.5 block text-xs font-medium tracking-wide text-ink-700 uppercase'

  return (
    <form method="get" className="rounded-card border border-ink-200 bg-surface p-5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
        <fieldset className="min-w-0">
          <legend className={label}>When do you need it?</legend>
          <div className="flex items-center gap-2">
            <input
              type="date"
              name="startDate"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="First day"
              className={`${inputClass} w-[10.5rem]`}
            />
            <span className="text-ink-400" aria-hidden>
              →
            </span>
            <input
              type="date"
              name="endDate"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Day you no longer need it"
              className={`${inputClass} w-[10.5rem]`}
            />
          </div>
        </fieldset>

        <div className="min-w-[9rem] flex-1">
          <label className={label} htmlFor="mediaType">
            Media type
          </label>
          <select
            id="mediaType"
            name="mediaType"
            defaultValue={query.mediaType ?? ''}
            className={inputClass}
          >
            <option value="">Any</option>
            {mediaTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[9rem] flex-1">
          <label className={label} htmlFor="locationId">
            Location
          </label>
          <select
            id="locationId"
            name="locationId"
            defaultValue={query.locationId ?? ''}
            className={inputClass}
          >
            <option value="">Anywhere</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label className={label} htmlFor="maxMonthlyBudget">
            Budget / month
          </label>
          <input
            id="maxMonthlyBudget"
            type="number"
            name="maxMonthlyBudget"
            min={0}
            step={50}
            placeholder="No limit"
            defaultValue={query.maxMonthlyBudget ?? ''}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={!valid}
          className="rounded-control bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Update results
        </button>
      </div>

      <p
        className={`mt-3 border-t border-ink-100 pt-3 text-xs ${valid ? 'text-ink-500' : 'text-critical'}`}
        role="status"
      >
        {valid && lastDay ? (
          <>
            Covers{' '}
            <span className="font-mono tabular text-ink-700">
              {formatDateShort(startDate)} – {formatDateShort(lastDay)}
            </span>{' '}
            · <span className="font-mono tabular text-ink-700">{days} days</span>. The second date
            is the day you no longer need it.
          </>
        ) : (
          'The second date has to be later than the first.'
        )}
      </p>
    </form>
  )
}
