-- CreateEnum
CREATE TYPE "CorpGrade" AS ENUM ('VIEWER', 'REQUESTER', 'APPROVER', 'MANAGER');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'EXTENSION_REQUESTED', 'TERMINATION_REQUESTED', 'ENDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "corpGrade" "CorpGrade";

-- CreateTable
CREATE TABLE "LeaseContract" (
    "id" TEXT NOT NULL,
    "corporationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "monthlyFeeKrw" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3),
    "requestedEndAt" TIMESTAMP(3),
    "requestNote" TEXT,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaseContract_corporationId_status_idx" ON "LeaseContract"("corporationId", "status");

-- CreateIndex
CREATE INDEX "LeaseContract_vehicleId_status_idx" ON "LeaseContract"("vehicleId", "status");

-- AddForeignKey
ALTER TABLE "LeaseContract" ADD CONSTRAINT "LeaseContract_corporationId_fkey" FOREIGN KEY ("corporationId") REFERENCES "Corporation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseContract" ADD CONSTRAINT "LeaseContract_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseContract" ADD CONSTRAINT "LeaseContract_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────── 백필 ───────────────────────────

-- 기존 법인 계정의 등급: CORP_MEMBER→REQUESTER, CORP_ADMIN→MANAGER
-- (법인 미소속 계정은 등급 없음 = NULL 유지)
UPDATE "User"
SET "corpGrade" = 'REQUESTER'
WHERE "role" = 'CORP_MEMBER' AND "corporationId" IS NOT NULL;

UPDATE "User"
SET "corpGrade" = 'MANAGER'
WHERE "role" = 'CORP_ADMIN' AND "corporationId" IS NOT NULL;

-- 기존 FMS 전용 차량 = "MOCAR가 법인에 리스한 차량"으로 개념 정리 →
-- 전용 차량 1대마다 진행 중(ACTIVE) 리스 계약 1건을 만든다.
-- 월 리스료는 실계약 정보가 없으므로 요금제 시간당 단가 × 90h 를 만원 단위로 반올림한 모의값,
-- 계약 기간은 마이그레이션 시점 기준 6개월 전 ~ 6개월 후(12개월 계약)로 둔다.
INSERT INTO "LeaseContract" (
  "id", "corporationId", "vehicleId", "monthlyFeeKrw", "startAt", "endAt", "status", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  v."corporationId",
  v."id",
  (ROUND(p."baseHourlyKrw" * 90 / 10000.0) * 10000)::int,
  NOW() - INTERVAL '6 months',
  NOW() + INTERVAL '6 months',
  'ACTIVE',
  NOW()
FROM "Vehicle" v
JOIN "PricingPlan" p ON p."id" = v."planId"
WHERE v."corporationId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "LeaseContract" l WHERE l."vehicleId" = v."id");
