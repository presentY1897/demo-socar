-- CreateEnum
CREATE TYPE "ConditionPhase" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "VehicleControlAction" AS ENUM ('UNLOCK', 'LOCK', 'HAZARD', 'HORN', 'IGNITION_ON', 'IGNITION_OFF');

-- CreateEnum
CREATE TYPE "InquiryCategory" AS ENUM ('VEHICLE', 'RESERVATION', 'RETURN', 'ACCIDENT', 'ETC');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'ANSWERED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'CLOSED');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "doorLocked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "engineOn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ConditionReport" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "phase" "ConditionPhase" NOT NULL,
    "notes" TEXT,
    "parkingNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConditionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionPhoto" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConditionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleControlLog" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "action" "VehicleControlAction" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleControlLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "rentalId" TEXT,
    "category" "InquiryCategory" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentPhoto" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConditionReport_rentalId_phase_idx" ON "ConditionReport"("rentalId", "phase");

-- CreateIndex
CREATE INDEX "ConditionPhoto_reportId_idx" ON "ConditionPhoto"("reportId");

-- CreateIndex
CREATE INDEX "VehicleControlLog_rentalId_at_idx" ON "VehicleControlLog"("rentalId", "at");

-- CreateIndex
CREATE INDEX "VehicleControlLog_vehicleId_at_idx" ON "VehicleControlLog"("vehicleId", "at");

-- CreateIndex
CREATE INDEX "Inquiry_userId_createdAt_idx" ON "Inquiry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Inquiry_status_createdAt_idx" ON "Inquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IncidentReport_rentalId_idx" ON "IncidentReport"("rentalId");

-- CreateIndex
CREATE INDEX "IncidentPhoto_incidentId_idx" ON "IncidentPhoto"("incidentId");

-- AddForeignKey
ALTER TABLE "ConditionReport" ADD CONSTRAINT "ConditionReport_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionPhoto" ADD CONSTRAINT "ConditionPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ConditionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleControlLog" ADD CONSTRAINT "VehicleControlLog_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleControlLog" ADD CONSTRAINT "VehicleControlLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentPhoto" ADD CONSTRAINT "IncidentPhoto_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "IncidentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
