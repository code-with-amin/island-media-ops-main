/**
 * Types for the supplied fixture file. These describe the shape Frameworks
 * gave us, not our storage model — the seed maps between the two.
 */

export interface FixtureRate {
  currency: string | null
  amount: number | null
  unit: string | null
  monthlyEquivalent: number | null
  label: string
}

export interface FixtureHistory {
  at: string
  actor: string
  action: string
  note: string | null
}

export interface Fixtures {
  schemaVersion: string
  fixtureClock: string
  currency: string
  mediaOwners: { id: string; name: string }[]
  locations: { id: string; name: string }[]
  products: {
    id: string
    name: string
    mediaOwnerId: string
    mediaType: string
    locationIds: string[]
    allocationModel: string
    capacityPoolId?: string
    description: string
    indicativeRate: FixtureRate
    minimumTermDays: number
    creativeSpec: Record<string, unknown> | null
  }[]
  assets: {
    id: string
    productId: string
    name: string
    locationId: string
    status: string
    verifiedAt: string | null
    verificationSource: string | null
    note?: string
  }[]
  capacityPools: {
    id: string
    productId: string
    name: string
    locationId: string
    capacity: number
    status: string
    verifiedAt: string | null
    verificationSource: string | null
  }[]
  bookings: {
    id: string
    campaignName: string | null
    productId: string
    assetId?: string | null
    capacityPoolId?: string | null
    capacityUnits?: number | null
    startDate: string
    endDate: string
    status: string
  }[]
  holds: {
    id: string
    productId: string
    assetId?: string | null
    capacityPoolId?: string | null
    capacityUnits?: number | null
    startDate: string
    endDate: string
    expiresAt: string
    status: string
  }[]
  outages: {
    id: string
    assetId: string
    startDate: string
    endDate: string
    reason: string
    status: string
  }[]
  bookingRequests: {
    id: string
    idempotencyKey: string | null
    advertiser: { name: string; contactName: string; email: string }
    productId: string
    requestedAssetId: string | null
    startDate: string
    endDate: string
    budget: number | null
    objective: string | null
    notes: string | null
    status: string
    createdAt: string
    history: FixtureHistory[]
    organisationId: string | null
  }[]
  users: {
    id: string
    name: string
    email: string
    role: string
    organisationId: string | null
    status: string
  }[]
  organisations: { id: string; name: string; createdAt: string; contractCount: number }[]
  contracts: {
    id: string
    organisationId: string
    bookingRequestId: string | null
    status: string
    version: number
    startDate: string
    endDate: string
    currency: string
    total: number
    issuedAt: string | null
    acceptedAt: string | null
    activatedAt: string | null
    items: {
      id: string
      productId: string
      assetId: string | null
      quantity: number
      unitRate: number
      rateUnit: string
      lineTotal: number
    }[]
    history: FixtureHistory[]
  }[]
  campaigns: {
    id: string
    organisationId: string
    contractId: string
    bookingId: string | null
    name: string
    status: string
    currentStage: string
    clientVisible: boolean
  }[]
  workOrders: {
    id: string
    campaignId: string
    contractId: string
    organisationId: string
    type: string
    status: string
    assignedUserId: string | null
    assetId: string | null
    scheduledStart: string
    scheduledEnd: string
    locationLabel: string
    instructions: string
    internalNotes: string | null
    completionNote: string | null
    proofRecordIds: string[]
    history: FixtureHistory[]
  }[]
  serviceEvents: {
    id: string
    organisationId: string
    contractId: string | null
    campaignId: string | null
    workOrderId: string | null
    at: string
    type: string
    title: string
    clientVisible: boolean
    clientSummary: string | null
  }[]
  clientRequests: {
    id: string
    organisationId: string
    contractId: string | null
    type: string
    status: string
    createdAt: string
    summary: string
    history: FixtureHistory[]
  }[]
  proofRecords: unknown[]
}
