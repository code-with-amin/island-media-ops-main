import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { getSession } from '@/server/session'
import { ApiError, notFound } from '@/server/errors'

/**
 * Serve a proof file.
 *
 * Prototype shortcut: the bytes live in the database as a base64 data URL and
 * are decoded here. What matters is the access rule, which is real — a client
 * may only read proof attached to their own organisation's work, and staff may
 * read any. Production would store the file in object storage, scan it, and
 * hand out a short-lived signed URL instead of proxying bytes.
 */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ proofId: string }> }) => {
    const session = await getSession()
    if (!session) throw new ApiError('forbidden', 'Sign in to view proof.')

    const { proofId } = await context.params
    const proof = await prisma.proofRecord.findUnique({
      where: { id: proofId },
      include: { workOrder: true },
    })
    if (!proof) throw notFound('That file could not be found.')

    const isStaff = session.role === 'manager' || session.role === 'fitter'
    const ownsIt = proof.workOrder.organisationId === session.organisationId
    if (!isStaff && !ownsIt) throw notFound('That file could not be found.')

    const base64 = proof.dataUrl.split(',')[1] ?? ''
    return new Response(Buffer.from(base64, 'base64'), {
      headers: {
        'content-type': proof.mimeType,
        'content-disposition': `inline; filename="${proof.fileName}"`,
        'cache-control': 'private, max-age=300',
      },
    })
  },
)
