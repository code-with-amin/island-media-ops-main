import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { requireClient } from '@/server/session'
import { actOnContract, type ClientContractAction } from '@/server/services/clientPortal'

/**
 * Accept a prototype contract, or request a change.
 *
 * Acceptance rechecks inventory inside its transaction and returns 409 if the
 * inventory has gone, leaving the contract untouched. A change request records
 * a pending item for management and never alters the issued terms.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ contractId: string }> }) => {
    const session = await requireClient()
    const { contractId } = await context.params
    const body = await readJson<ClientContractAction>(request)

    const contract = await actOnContract(prisma, session.organisationId, contractId, body)
    return NextResponse.json(contract)
  },
)
