'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card, ErrorNotice, Field, Notice, SectionHeading, inputClass } from './primitives'

/**
 * Create a work order.
 *
 * Assigning a fitter is what makes the job appear on their phone and tells the
 * client that work is scheduled, so the form treats assignment as the main
 * decision rather than an afterthought.
 *
 * Instructions and internal notes are separate fields on purpose: instructions
 * are safe to show anyone working the job, internal notes never leave the
 * agency and the assigned fitter.
 */
export function WorkOrderCreator({
  campaigns,
  fitters,
  assets,
}: {
  campaigns: { id: string; label: string }[]
  fitters: { id: string; name: string }[]
  assets: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)

  async function create(formData: FormData) {
    setError(null)
    setCreated(null)
    setPending(true)

    const date = formData.get('date') as string
    const start = formData.get('startTime') as string
    const end = formData.get('endTime') as string

    const response = await fetch('/api/management/work-orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        campaignId: formData.get('campaignId'),
        type: formData.get('type'),
        assignedUserId: formData.get('assignedUserId') || null,
        assetId: formData.get('assetId') || null,
        scheduledStart: `${date}T${start}:00Z`,
        scheduledEnd: `${date}T${end}:00Z`,
        locationLabel: formData.get('locationLabel'),
        instructions: formData.get('instructions'),
        internalNotes: formData.get('internalNotes') || null,
      }),
    })

    setPending(false)

    if (response.ok) {
      const job = await response.json()
      setCreated(job.id)
      router.refresh()
      return
    }

    const body = await response.json().catch(() => null)
    setError({
      message: body?.message ?? 'The job could not be created.',
      details: body?.details ?? ['Check your connection and try again.'],
    })
  }

  if (campaigns.length === 0) {
    return (
      <Card className="p-5">
        <SectionHeading eyebrow="New job" title="Nothing to schedule against" />
        <p className="text-sm text-ink-600">
          Field work is created against an accepted contract. Issue a contract and have the client
          accept it first.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <SectionHeading eyebrow="New job" title="Schedule field work" />

      {created ? (
        <div className="mb-3">
          <Notice tone="positive" title="Job created and assigned">
            <p className="font-mono text-xs tabular">{created}</p>
            <p className="mt-1">It is now on the fitter&apos;s phone, and the client can see that work is scheduled.</p>
          </Notice>
        </div>
      ) : null}

      {error ? <div className="mb-3"><ErrorNotice title={error.message} details={error.details} /></div> : null}

      <form action={create} className="space-y-3">
        <Field label="Campaign">
          <select name="campaignId" required className={inputClass}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Job type">
          <select name="type" required defaultValue="installation" className={inputClass}>
            <option value="installation">Installation</option>
            <option value="maintenance">Maintenance</option>
            <option value="removal">Removal</option>
          </select>
        </Field>

        <Field label="Assign to" hint="An unassigned job stays a draft and reaches nobody">
          <select name="assignedUserId" required className={inputClass}>
            {fitters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Asset">
          <select name="assetId" className={inputClass}>
            <option value="">Not asset specific</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Date">
          <input type="date" name="date" required defaultValue="2027-01-20" className={inputClass} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="time" name="startTime" required defaultValue="09:00" className={inputClass} />
          </Field>
          <Field label="Until">
            <input type="time" name="endTime" required defaultValue="11:00" className={inputClass} />
          </Field>
        </div>

        <Field label="Where">
          <input
            name="locationLabel"
            required
            placeholder="ParcelFleet East depot"
            className={inputClass}
          />
        </Field>

        <Field label="Instructions" hint="What the fitter needs to do on site">
          <textarea
            name="instructions"
            rows={2}
            required
            placeholder="Fit approved rear panel. Photograph the finished panel and asset identifier."
            className={inputClass}
          />
        </Field>

        <Field label="Internal notes" hint="Never shown to the client">
          <textarea name="internalNotes" rows={2} className={inputClass} />
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create and assign'}
        </button>
      </form>
    </Card>
  )
}
