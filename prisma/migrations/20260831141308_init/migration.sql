-- CreateTable
CREATE TABLE "MediaOwner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mediaOwnerId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "allocationModel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "minimumTermDays" INTEGER NOT NULL,
    "rateCurrency" TEXT,
    "rateAmount" REAL,
    "rateUnit" TEXT,
    "rateMonthlyEquivalent" REAL,
    "rateLabel" TEXT NOT NULL,
    "creativeSpec" TEXT,
    CONSTRAINT "Product_mediaOwnerId_fkey" FOREIGN KEY ("mediaOwnerId") REFERENCES "MediaOwner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductLocation" (
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    PRIMARY KEY ("productId", "locationId"),
    CONSTRAINT "ProductLocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "verificationSource" TEXT,
    "note" TEXT,
    CONSTRAINT "Asset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapacityPool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "verificationSource" TEXT,
    CONSTRAINT "CapacityPool_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CapacityPool_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignName" TEXT,
    "productId" TEXT NOT NULL,
    "assetId" TEXT,
    "capacityPoolId" TEXT,
    "capacityUnits" INTEGER,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "Booking_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Booking_capacityPoolId_fkey" FOREIGN KEY ("capacityPoolId") REFERENCES "CapacityPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Hold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "assetId" TEXT,
    "capacityPoolId" TEXT,
    "capacityUnits" INTEGER,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "Hold_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Hold_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Hold_capacityPoolId_fkey" FOREIGN KEY ("capacityPoolId") REFERENCES "CapacityPool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Outage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "Outage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organisationId" TEXT,
    "status" TEXT NOT NULL,
    CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT,
    "organisationId" TEXT,
    "advertiserName" TEXT NOT NULL,
    "advertiserContactName" TEXT NOT NULL,
    "advertiserEmail" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requestedAssetId" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "budget" REAL,
    "objective" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "BookingRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "bookingRequestId" TEXT,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "total" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "issuedAt" DATETIME,
    "acceptedAt" DATETIME,
    "activatedAt" DATETIME,
    CONSTRAINT "Contract_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "assetId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitRate" REAL NOT NULL,
    "rateUnit" TEXT NOT NULL,
    "lineTotal" REAL NOT NULL,
    CONSTRAINT "ContractItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "bookingId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentStage" TEXT NOT NULL,
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Campaign_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Campaign_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Campaign_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "assetId" TEXT,
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME NOT NULL,
    "locationLabel" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "internalNotes" TEXT,
    "completionNote" TEXT,
    "blockedReason" TEXT,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "WorkOrder_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProofRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workOrderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "capturedByUserId" TEXT,
    CONSTRAINT "ProofRecord_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProofRecord_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT,
    "campaignId" TEXT,
    "workOrderId" TEXT,
    "at" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "clientSummary" TEXT,
    CONSTRAINT "ServiceEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ServiceEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ServiceEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "contractId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    CONSTRAINT "ClientRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "ShortlistItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShortlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HistoryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Asset_productId_idx" ON "Asset"("productId");

-- CreateIndex
CREATE INDEX "Booking_productId_startDate_endDate_idx" ON "Booking"("productId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Hold_productId_startDate_endDate_idx" ON "Hold"("productId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Outage_assetId_startDate_endDate_idx" ON "Outage"("assetId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "BookingRequest_status_idx" ON "BookingRequest"("status");

-- CreateIndex
CREATE INDEX "Contract_organisationId_status_idx" ON "Contract"("organisationId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedUserId_status_idx" ON "WorkOrder"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "ServiceEvent_organisationId_at_idx" ON "ServiceEvent"("organisationId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistItem_organisationId_productId_key" ON "ShortlistItem"("organisationId", "productId");

-- CreateIndex
CREATE INDEX "HistoryEvent_entityType_entityId_at_idx" ON "HistoryEvent"("entityType", "entityId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_key_key" ON "IdempotencyRecord"("scope", "key");
