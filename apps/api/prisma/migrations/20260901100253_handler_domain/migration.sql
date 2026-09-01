-- CreateEnum
CREATE TYPE "HandlerTaskType" AS ENUM ('DELIVERY', 'RETRIEVE', 'REPOSITION');

-- CreateEnum
CREATE TYPE "HandlerTaskStatus" AS ENUM ('PENDING', 'ASSIGNED', 'EN_ROUTE', 'DONE', 'CANCELED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HANDLER';

-- CreateTable
CREATE TABLE "HandlerTask" (
    "id" TEXT NOT NULL,
    "type" "HandlerTaskType" NOT NULL,
    "status" "HandlerTaskStatus" NOT NULL DEFAULT 'PENDING',
    "reservationId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "fromZoneId" TEXT NOT NULL,
    "fromLat" DOUBLE PRECISION,
    "fromLng" DOUBLE PRECISION,
    "fromLabel" TEXT,
    "toZoneId" TEXT,
    "toLat" DOUBLE PRECISION,
    "toLng" DOUBLE PRECISION,
    "toLabel" TEXT,
    "assigneeId" TEXT,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "completionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandlerTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandlerTaskPhoto" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandlerTaskPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandlerTask_assigneeId_status_dueAt_idx" ON "HandlerTask"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "HandlerTask_status_dueAt_idx" ON "HandlerTask"("status", "dueAt");

-- CreateIndex
CREATE INDEX "HandlerTask_reservationId_idx" ON "HandlerTask"("reservationId");

-- CreateIndex
CREATE INDEX "HandlerTask_vehicleId_dueAt_idx" ON "HandlerTask"("vehicleId", "dueAt");

-- CreateIndex
CREATE INDEX "HandlerTaskPhoto_taskId_idx" ON "HandlerTaskPhoto"("taskId");

-- AddForeignKey
ALTER TABLE "HandlerTask" ADD CONSTRAINT "HandlerTask_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandlerTask" ADD CONSTRAINT "HandlerTask_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandlerTask" ADD CONSTRAINT "HandlerTask_fromZoneId_fkey" FOREIGN KEY ("fromZoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandlerTask" ADD CONSTRAINT "HandlerTask_toZoneId_fkey" FOREIGN KEY ("toZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandlerTask" ADD CONSTRAINT "HandlerTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandlerTaskPhoto" ADD CONSTRAINT "HandlerTaskPhoto_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HandlerTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
