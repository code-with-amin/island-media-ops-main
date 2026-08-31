import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, requireIdempotencyKey, route } from '@/server/http'
import { requireRole } from '@/server/session'
import { addProof, type ProofInput } from '@/server/services/fieldWork'

/**
 * Attach proof of completion.
 *
 * The Idempotency-Key is what makes a retry from a phone on weak signal safe:
 * a fitter who cannot tell whether the first upload landed can press the
 * button again without producing two copies of the same photograph.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ workOrderId: string }> }) => {
    const session = await requireRole('fitter')
    const { workOrderId } = await context.params
    const idempotencyKey = requireIdempotencyKey(request)
    const body = await readJson<Omit<ProofInput, 'idempotencyKey'>>(request)

    const proof = await addProof(prisma, workOrderId, session.userId, {
      ...body,
      idempotencyKey,
    })

    // The data URL is deliberately not echoed back: the phone already has the
    // bytes, and the response should stay small on a poor connection.
    return NextResponse.json(
      {
        id: proof.id,
        fileName: proof.fileName,
        mimeType: proof.mimeType,
        sizeBytes: proof.sizeBytes,
        capturedAt: proof.capturedAt,
      },
      { status: 201 },
    )
  },
)
