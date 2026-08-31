-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'CORP_MEMBER', 'CORP_ADMIN', 'OPS_ADMIN');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('EV', 'GASOLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'IN_USE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InsuranceTier" AS ENUM ('LIGHT', 'STANDARD', 'FULL');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('IN_USE', 'RETURN_PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('UPFRONT', 'DRIVE_SETTLEMENT', 'PENALTY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('SIGNUP_BONUS', 'USE', 'REFUND', 'ADMIN');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('REQUESTED', 'RECOMMENDED', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "corporationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Corporation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officeAddress" TEXT NOT NULL,
    "officeLat" DOUBLE PRECISION NOT NULL,
    "officeLng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Corporation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseHourlyKrw" INTEGER NOT NULL,
    "weekendHourlyKrw" INTEGER NOT NULL,
    "perKmKrw" INTEGER NOT NULL,
    "insuranceLightKrw" INTEGER NOT NULL,
    "insuranceStandardKrw" INTEGER NOT NULL,
    "insuranceFullKrw" INTEGER NOT NULL,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "plateNo" TEXT NOT NULL,
    "fuel" "FuelType" NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "imageUrl" TEXT,
    "zoneId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "insurance" "InsuranceTier" NOT NULL,
    "rentalFeeKrw" INTEGER NOT NULL,
    "insuranceFeeKrw" INTEGER NOT NULL,
    "discountKrw" INTEGER NOT NULL DEFAULT 0,
    "creditUsedKrw" INTEGER NOT NULL DEFAULT 0,
    "totalUpfrontKrw" INTEGER NOT NULL,
    "couponId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rental" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'IN_USE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "distanceKm" DOUBLE PRECISION,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "driveFeeKrw" INTEGER,
    "lateFeeKrw" INTEGER,

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amountKrw" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "cardLast4" TEXT,
    "approvedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountKrw" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deltaKrw" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "memo" TEXT,
    "reservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchRequest" (
    "id" TEXT NOT NULL,
    "corporationId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "originLabel" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "desiredStartAt" TIMESTAMP(3) NOT NULL,
    "desiredEndAt" TIMESTAMP(3) NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'REQUESTED',
    "reservationId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchCandidate" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "walkSeconds" INTEGER NOT NULL,
    "walkMeters" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL,
    "lateRiskPct" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plateNo_key" ON "Vehicle"("plateNo");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_couponId_key" ON "Reservation"("couponId");

-- CreateIndex
CREATE INDEX "Reservation_vehicleId_startAt_idx" ON "Reservation"("vehicleId", "startAt");

-- CreateIndex
CREATE INDEX "Reservation_userId_startAt_idx" ON "Reservation"("userId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rental_reservationId_key" ON "Rental"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_idx" ON "CreditLedger"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchRequest_reservationId_key" ON "DispatchRequest"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchCandidate_requestId_vehicleId_key" ON "DispatchCandidate"("requestId", "vehicleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_corporationId_fkey" FOREIGN KEY ("corporationId") REFERENCES "Corporation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PricingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRequest" ADD CONSTRAINT "DispatchRequest_corporationId_fkey" FOREIGN KEY ("corporationId") REFERENCES "Corporation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRequest" ADD CONSTRAINT "DispatchRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRequest" ADD CONSTRAINT "DispatchRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRequest" ADD CONSTRAINT "DispatchRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchCandidate" ADD CONSTRAINT "DispatchCandidate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DispatchRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchCandidate" ADD CONSTRAINT "DispatchCandidate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

