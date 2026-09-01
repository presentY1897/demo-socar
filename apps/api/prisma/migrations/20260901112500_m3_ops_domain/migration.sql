-- M3-1 운영 백오피스 도메인.
-- 텔레메트리 · 도입/보험 · 존 계약 · 정비 메모를 한 번에 추가하고,
-- M1-4가 Vehicle에 임시로 두었던 스마트키 상태(doorLocked/engineOn)를 텔레메트리로 이관한다.
-- 순서가 중요하다: 표를 만들고 → 값을 옮기고 → 그다음에 옛 컬럼을 지운다.

-- CreateEnum
CREATE TYPE "AcquisitionType" AS ENUM ('PURCHASE', 'LEASE');

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "answeredById" TEXT;

-- CreateTable
CREATE TABLE "VehicleTelemetry" (
    "vehicleId" TEXT NOT NULL,
    "fuelPct" DOUBLE PRECISION NOT NULL,
    "odometerKm" DOUBLE PRECISION NOT NULL,
    "doorLocked" BOOLEAN NOT NULL DEFAULT true,
    "engineOn" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleTelemetry_pkey" PRIMARY KEY ("vehicleId")
);

-- CreateTable
CREATE TABLE "VehicleFinance" (
    "vehicleId" TEXT NOT NULL,
    "acquisitionType" "AcquisitionType" NOT NULL,
    "acquisitionCostKrw" INTEGER,
    "monthlyLeaseKrw" INTEGER,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "insurerName" TEXT NOT NULL,
    "insurancePremiumKrw" INTEGER NOT NULL,
    "insuranceExpiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleFinance_pkey" PRIMARY KEY ("vehicleId")
);

-- CreateTable
CREATE TABLE "ZoneContract" (
    "zoneId" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "partnerName" TEXT,
    "monthlyFeeKrw" INTEGER NOT NULL DEFAULT 0,
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),

    CONSTRAINT "ZoneContract_pkey" PRIMARY KEY ("zoneId")
);

-- CreateTable
CREATE TABLE "VehicleMaintenanceNote" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleMaintenanceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleTelemetry_fuelPct_idx" ON "VehicleTelemetry"("fuelPct");

-- CreateIndex
CREATE INDEX "VehicleFinance_insuranceExpiresAt_idx" ON "VehicleFinance"("insuranceExpiresAt");

-- CreateIndex
CREATE INDEX "ZoneContract_contractEnd_idx" ON "ZoneContract"("contractEnd");

-- CreateIndex
CREATE INDEX "VehicleMaintenanceNote_vehicleId_createdAt_idx" ON "VehicleMaintenanceNote"("vehicleId", "createdAt");

-- AddForeignKey
ALTER TABLE "VehicleTelemetry" ADD CONSTRAINT "VehicleTelemetry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleFinance" ADD CONSTRAINT "VehicleFinance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneContract" ADD CONSTRAINT "ZoneContract_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMaintenanceNote" ADD CONSTRAINT "VehicleMaintenanceNote_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleMaintenanceNote" ADD CONSTRAINT "VehicleMaintenanceNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: Vehicle.doorLocked/engineOn → VehicleTelemetry
-- 기존 행에는 연료·주행거리·좌표가 없었다. 좌표는 배정 존을, 나머지는 차량 id 해시로
-- 그럴듯한 초기값을 만든다 (같은 DB에서 몇 번을 돌려도 같은 값 — 재현 가능해야 디버깅이 된다).
INSERT INTO "VehicleTelemetry" ("vehicleId", "fuelPct", "odometerKm", "doorLocked", "engineOn", "lat", "lng", "updatedAt")
SELECT
  v."id",
  35 + (abs(hashtext(v."id")) % 60)::double precision,
  1200 + (abs(hashtext(v."id" || ':odo')) % 60000)::double precision,
  v."doorLocked",
  v."engineOn",
  z."lat",
  z."lng",
  NOW()
FROM "Vehicle" v
JOIN "Zone" z ON z."id" = v."zoneId";

-- AlterTable — 이관이 끝난 뒤에 지운다
ALTER TABLE "Vehicle" DROP COLUMN "doorLocked",
DROP COLUMN "engineOn";
