-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "onewayFeeKrw" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnZoneId" TEXT;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_returnZoneId_fkey" FOREIGN KEY ("returnZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
