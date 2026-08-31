'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Card, ErrorNotice, Field, Notice, inputClassLarge } from './primitives'

/**
 * Everything a fitter does on site.
 *
 * Three things shape this component, all of them from standing outside a depot
 * rather than sitting at a desk:
 *
 * 1. The next step is one large button. A fitter progressing a job should not
 *    have to read a form to find it.
 * 2. Uploads are queued on the device before they are sent. Signal drops
 *    inside depots and car parks, and losing a photograph because the upload
 *    failed means a second trip.
 * 3. Every queued upload carries a stable idempotency key. Retrying — by
 *    hand, or automatically when the connection returns — cannot produce two
 *    copies of the same photograph, which is the actual risk of a retry queue.
 */

interface PendingProof {
  key: string
  fileName: string
  mimeType: string
  dataUrl: string
}

interface SavedProof {
  id: string
  fileName: string
  sizeBytes: number
}

const queueKey = (workOrderId: string) => `ims.proof-queue.${workOrderId}`

function readQueue(workOrderId: string): PendingProof[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(workOrderId)) ?? '[]') as PendingProof[]
  } catch {
    return []
  }
}

function writeQueue(workOrderId: string, queue: PendingProof[]) {
  try {
    localStorage.setItem(queueKey(workOrderId), JSON.stringify(queue))
  } catch {
    // A full or unavailable store must not break the job. The fitter keeps
    // the in-memory copy for this session and can retry.
  }
}

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.readAsDataURL(file)
  })

export function JobActions({
  workOrderId,
  status,
  proofs,
  completionNote,
}: {
  workOrderId: string
  status: string
  proofs: SavedProof[]
  completionNote: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)
  const [queue, setQueue] = useState<PendingProof[]>([])
  const [mode, setMode] = useState<'idle' | 'blocking' | 'completing'>('idle')

  useEffect(() => {
    setQueue(readQueue(workOrderId))
  }, [workOrderId])

  const updateQueue = useCallback(
    (next: PendingProof[]) => {
      setQueue(next)
      writeQueue(workOrderId, next)
    },
    [workOrderId],
  )

  /** Sends one queued proof. Returns true when the server has it. */
  const send = useCallback(
    async (proof: PendingProof): Promise<boolean> => {
      let response: Response
      try {
        response = await fetch(`/api/mobile/work-orders/${workOrderId}/proof`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': proof.key },
          body: JSON.stringify({
            fileName: proof.fileName,
            mimeType: proof.mimeType,
            dataUrl: proof.dataUrl,
          }),
        })
      } catch {
        // No signal at all: fetch rejects rather than returning a response.
        // The proof stays queued, which is the whole point of the queue.
        return false
      }

      if (response.ok) return true

      // A rejected file will never succeed, so it leaves the queue with an
      // explanation rather than retrying for ever.
      if (response.status === 422) {
        const body = await response.json().catch(() => null)
        setError({
          message: body?.message ?? 'That file could not be used as proof.',
          details: body?.details ?? [],
        })
        return true
      }

      return false
    },
    [workOrderId],
  )

  const flush = useCallback(async () => {
    const current = readQueue(workOrderId)
    if (current.length === 0) return

    setPending('upload')
    const remaining: PendingProof[] = []
    for (const proof of current) {
      const sent = await send(proof)
      if (!sent) remaining.push(proof)
    }
    updateQueue(remaining)
    setPending(null)

    // Clear any earlier failure: a stale "it did not send" left on screen
    // after a successful retry is worse than no message at all.
    if (remaining.length === 0) {
      setError(null)
      router.refresh()
    }

    // Nothing else to say when items remain: the queue banner below already
    // reports how many are waiting and offers the retry, and two notices
    // saying the same thing is noise on a small screen.
  }, [workOrderId, send, updateQueue, router])

  // Retry automatically the moment the connection comes back.
  useEffect(() => {
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flush])

  async function capture(file: File) {
    setError(null)
    let dataUrl: string
    try {
      dataUrl = await readFile(file)
    } catch {
      setError({ message: 'That photo could not be read.', details: ['Try taking it again.'] })
      return
    }

    const proof: PendingProof = {
      key: `proof-${workOrderId}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      fileName: file.name || 'photo.jpg',
      mimeType: file.type || 'image/jpeg',
      dataUrl,
    }

    // Queue first, then send. If the tab dies mid-upload the photo survives.
    updateQueue([...readQueue(workOrderId), proof])
    await flush()
  }

  async function transition(label: string, body: Record<string, unknown>) {
    setError(null)
    setPending(label)

    let response: Response
    try {
      response = await fetch(`/api/mobile/work-orders/${workOrderId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      setPending(null)
      setError({
        message: 'That update did not send.',
        details: ['You appear to be offline. Try again when you have signal.'],
      })
      return
    }
    setPending(null)

    if (response.ok) {
      setMode('idle')
      router.refresh()
      return
    }

    const parsed = await response.json().catch(() => null)
    setError({
      message: parsed?.message ?? 'That could not be saved.',
      details: parsed?.details ?? ['Check your signal and try again.'],
    })
  }

  const totalProof = proofs.length + queue.length

  if (status === 'completed') {
    return (
      <Card className="p-4">
        <Notice tone="positive" title="Job completed">
          {completionNote}
        </Notice>
        <ul className="mt-3 space-y-1.5">
          {proofs.map((proof) => (
            <li key={proof.id} className="flex items-center justify-between gap-3 text-sm">
              <a
                href={`/api/proof/${proof.id}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-brand-600"
              >
                {proof.fileName}
              </a>
              <span className="shrink-0 font-mono text-xs tabular text-ink-500">
                {Math.round(proof.sizeBytes / 1024)} KB
              </span>
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  const next =
    status === 'assigned'
      ? { to: 'travelling', label: 'Start travelling' }
      : status === 'travelling'
        ? { to: 'on_site', label: "I've arrived on site" }
        : status === 'blocked'
          ? { to: 'on_site', label: 'Back on site — resume' }
          : null

  return (
    <div className="space-y-4">
      {error ? <ErrorNotice title={error.message} details={error.details} /> : null}

      {queue.length > 0 ? (
        <Notice tone="caution" title={`${queue.length} photo${queue.length === 1 ? '' : 's'} waiting to send`}>
          <p>Saved on this phone. They will send automatically when you have signal.</p>
          <button
            type="button"
            onClick={() => void flush()}
            disabled={pending === 'upload'}
            className="mt-2 rounded-control border border-caution px-3 py-1.5 text-sm font-medium text-caution disabled:opacity-60"
          >
            {pending === 'upload' ? 'Sending…' : 'Retry now'}
          </button>
        </Notice>
      ) : null}

      {mode === 'idle' ? (
        <div className="space-y-2">
          {next ? (
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => transition(next.to, { to: next.to })}
              className="w-full rounded-control bg-brand-600 px-4 py-4 text-base font-medium text-white active:bg-brand-700 disabled:opacity-60"
            >
              {pending === next.to ? 'Saving…' : next.label}
            </button>
          ) : null}

          {status === 'on_site' ? (
            <button
              type="button"
              onClick={() => setMode('completing')}
              className="w-full rounded-control bg-brand-600 px-4 py-4 text-base font-medium text-white active:bg-brand-700"
            >
              Finish this job
            </button>
          ) : null}

          {status !== 'blocked' ? (
            <button
              type="button"
              onClick={() => setMode('blocking')}
              className="w-full rounded-control border border-critical/40 px-4 py-3 text-base font-medium text-critical active:bg-critical-soft"
            >
              I can&apos;t do this job
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === 'blocking' ? (
        <Card className="p-4">
          <form
            action={async (formData) => {
              await transition('blocked', {
                to: 'blocked',
                blockedReason: formData.get('blockedReason'),
              })
            }}
            className="space-y-3"
          >
            <Field label="What is stopping you?" hint="The office sees this straight away">
              <textarea
                name="blockedReason"
                rows={3}
                required
                placeholder="Depot gate locked, no key holder on site."
                className={inputClassLarge}
              />
            </Field>
            <button
              type="submit"
              disabled={pending !== null}
              className="w-full rounded-control bg-critical px-4 py-3.5 text-base font-medium text-white disabled:opacity-60"
            >
              {pending === 'blocked' ? 'Saving…' : 'Mark as blocked'}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="w-full py-2 text-sm text-ink-600"
            >
              Cancel
            </button>
          </form>
        </Card>
      ) : null}

      {mode === 'completing' ? (
        <Card className="p-4">
          <p className="font-medium text-ink-900">Finish the job</p>
          <p className="mt-1 text-sm text-ink-600">
            A photo of the finished work is required, so the office and the client can see it was
            done.
          </p>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">Photos</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void capture(file)
                  e.target.value = ''
                }}
                className="mt-1.5 w-full rounded-control border border-ink-300 bg-surface px-3 py-3 text-sm file:mr-3 file:rounded-chip file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-white"
              />
            </label>

            {totalProof > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {proofs.map((proof) => (
                  <li key={proof.id} className="flex items-center gap-2 text-positive">
                    <span aria-hidden>✓</span>
                    <span className="truncate">{proof.fileName}</span>
                  </li>
                ))}
                {queue.map((proof) => (
                  <li key={proof.key} className="flex items-center gap-2 text-caution">
                    <span aria-hidden>⟳</span>
                    <span className="truncate">{proof.fileName} — waiting to send</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">No photo added yet.</p>
            )}

            <form
              action={async (formData) => {
                await transition('completed', {
                  to: 'completed',
                  completionNote: formData.get('completionNote'),
                })
              }}
              className="space-y-3"
            >
              <Field label="What did you do?">
                <textarea
                  name="completionNote"
                  rows={3}
                  required
                  placeholder="Panel fitted and photographed. Asset identifier checked."
                  className={inputClassLarge}
                />
              </Field>

              <button
                type="submit"
                disabled={pending !== null || proofs.length === 0}
                className="w-full rounded-control bg-brand-600 px-4 py-3.5 text-base font-medium text-white disabled:opacity-60"
              >
                {pending === 'completed' ? 'Saving…' : 'Mark job complete'}
              </button>

              {proofs.length === 0 ? (
                <p className="text-center text-xs text-ink-500">
                  {queue.length > 0
                    ? 'Waiting for your photo to send before you can finish.'
                    : 'Add a photo to finish the job.'}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => setMode('idle')}
                className="w-full py-2 text-sm text-ink-600"
              >
                Cancel
              </button>
            </form>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
