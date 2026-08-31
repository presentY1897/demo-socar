-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "deliveryFeeKrw" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryLabel" TEXT,
ADD COLUMN     "deliveryLat" DOUBLE PRECISION,
ADD COLUMN     "deliveryLng" DOUBLE PRECISION;
