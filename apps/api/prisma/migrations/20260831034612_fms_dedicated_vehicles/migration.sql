-- AlterTable
ALTER TABLE "DispatchCandidate" ADD COLUMN     "isDedicated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "corporationId" TEXT;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "corporationId" TEXT;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_corporationId_fkey" FOREIGN KEY ("corporationId") REFERENCES "Corporation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_corporationId_fkey" FOREIGN KEY ("corporationId") REFERENCES "Corporation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
