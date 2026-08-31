import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { quote, settle, validateSlotRange, type ExtendRentalDto } from '@socar/shared';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt-auth.guard';

function isOverlapViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('23P01') || msg.includes('reservation_no_overlap');
}

/**
 * 대여 라이프사이클 상태 머신.
 *
 *   Reservation(CONFIRMED) --문열기--> Rental(IN_USE) + Reservation(IN_USE)
 *   Rental(IN_USE) --연장--> 반납 시각 연장 (뒤 예약과 충돌 시 409)
 *   Rental(IN_USE) --반납하기--> Rental(RETURN_PENDING, 주행거리 자동 확정)
 *   Rental(RETURN_PENDING) --정산성공--> COMPLETED (+ 편도면 차량 존 이동)
 *
 * 주행거리는 차량 텔레메트리가 알려주는 값이라 사용자 입력이 없다 —
 * 데모에서는 이용 시간 기반 모의값을 서버가 생성한다.
 */
@Injectable()
export class RentalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  /** 스마트키 문열기 = 대여 시작 */
  async start(user: JwtUser, reservationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const resv = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!resv) throw new NotFoundException('예약을 찾을 수 없습니다');
      if (resv.userId !== user.id) throw new ForbiddenException('본인 예약만 시작할 수 있습니다');
      if (resv.status !== 'CONFIRMED') throw new BadRequestException('시작할 수 없는 예약 상태입니다');

      const now = Date.now();
      if (now < resv.startAt.getTime() - 10 * 60 * 1000) {
        throw new BadRequestException('예약 시작 10분 전부터 이용할 수 있습니다');
      }
      if (now > resv.endAt.getTime()) {
        throw new BadRequestException('예약 시간이 지났습니다');
      }

      await tx.reservation.update({ where: { id: reservationId }, data: { status: 'IN_USE' } });
      return tx.rental.create({
        data: { reservationId, status: 'IN_USE' },
        include: { reservation: { include: { vehicle: { include: { zone: true } } } } },
      });
    });
  }

  /** 이용 중 반납 시각 연장 — 뒤 예약과 충돌하면 409 (EXCLUDE 제약이 최종 방어) */
  async extend(user: JwtUser, rentalId: string, dto: ExtendRentalDto) {
    const newEndAt = new Date(dto.endAt);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rental = await this.ownedRental(tx, user, rentalId);
        if (rental.status !== 'IN_USE') throw new BadRequestException('이용 중일 때만 연장할 수 있습니다');

        const resv = rental.reservation;
        if (newEndAt.getTime() <= resv.endAt.getTime()) {
          throw new BadRequestException('현재 반납 시각 이후로만 연장할 수 있습니다');
        }
        const rangeError = validateSlotRange(resv.startAt, newEndAt);
        if (rangeError) throw new BadRequestException(rangeError);

        // 연장 구간 충돌 사전 확인 (자기 예약 제외)
        const conflict = await tx.reservation.findFirst({
          where: {
            vehicleId: resv.vehicleId,
            id: { not: resv.id },
            status: { in: ['CONFIRMED', 'IN_USE'] },
            startAt: { lt: newEndAt },
            endAt: { gt: resv.endAt },
          },
          select: { startAt: true },
        });
        if (conflict) {
          throw new ConflictException('연장하려는 시간에 다음 예약이 있어요');
        }

        // 연장분 요금 = 연장 구간의 대여요금 + 면책상품 (전용 차량은 무료)
        const isDedicated = rental.reservation.vehicle.corporationId !== null;
        let extRentalFee = 0;
        let extInsuranceFee = 0;
        if (!isDedicated) {
          const plan = await tx.pricingPlan.findUniqueOrThrow({
            where: { id: rental.reservation.vehicle.planId },
          });
          const ext = quote({
            plan,
            startAt: resv.endAt,
            endAt: newEndAt,
            insurance: resv.insurance,
          });
          extRentalFee = ext.rentalFeeKrw;
          extInsuranceFee = ext.insuranceFeeKrw;
        }
        const extensionFee = extRentalFee + extInsuranceFee;

        if (extensionFee > 0) {
          const upfront = await tx.payment.findFirst({
            where: { reservationId: resv.id, kind: 'UPFRONT' },
          });
          await this.payments.charge(tx, {
            reservationId: resv.id,
            kind: 'UPFRONT',
            amountKrw: extensionFee,
            idempotencyKey: dto.idempotencyKey,
            cardLast4: upfront?.cardLast4 ?? '4242',
          });
        }

        await tx.reservation.update({
          where: { id: resv.id },
          data: {
            endAt: newEndAt,
            rentalFeeKrw: { increment: extRentalFee },
            insuranceFeeKrw: { increment: extInsuranceFee },
            totalUpfrontKrw: { increment: extensionFee },
          },
        });
        return tx.rental.findUniqueOrThrow({
          where: { id: rentalId },
          include: { reservation: { include: { payments: true } } },
        });
      });
    } catch (e) {
      if (isOverlapViolation(e)) {
        throw new ConflictException('연장하려는 시간에 다음 예약이 있어요');
      }
      throw e;
    }
  }

  /** 반납 접수: 텔레메트리(모의)로 주행거리 자동 확정 후 정산 */
  async requestReturn(user: JwtUser, rentalId: string) {
    await this.prisma.$transaction(async (tx) => {
      const rental = await this.ownedRental(tx, user, rentalId);
      if (rental.status !== 'IN_USE') throw new BadRequestException('이용 중인 대여만 반납할 수 있습니다');

      const returnedAt = new Date();
      const lateMs = returnedAt.getTime() - rental.reservation.endAt.getTime();
      const lateMinutes = Math.max(0, Math.ceil(lateMs / 60000));

      // 텔레메트리 모의: 이용 경과시간 × 15~35km/h
      const elapsedHours = Math.max(
        (returnedAt.getTime() - rental.startedAt.getTime()) / 3600000,
        0.05,
      );
      const distanceKm = Math.round(elapsedHours * (15 + Math.random() * 20) * 10) / 10;

      await tx.rental.update({
        where: { id: rentalId },
        data: { status: 'RETURN_PENDING', returnedAt, distanceKm, lateMinutes },
      });
    });

    return this.settleReturn(user, rentalId);
  }

  /** 주행요금 + 지연요금 정산 (실패 시 재시도 가능). 편도면 차량을 반납 존으로 이동 */
  async settleReturn(user: JwtUser, rentalId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rental = await this.ownedRental(tx, user, rentalId);
      if (rental.status !== 'RETURN_PENDING') {
        throw new BadRequestException('정산 대기 상태가 아닙니다');
      }

      // 법인 전용 차량(FMS)은 과금 없음 — 주행거리는 운행일지로만 기록
      let s = { driveFeeKrw: 0, lateFeeKrw: 0, totalKrw: 0 };
      if (rental.reservation.vehicle.corporationId === null) {
        const plan = await tx.pricingPlan.findUniqueOrThrow({
          where: { id: rental.reservation.vehicle.planId },
        });
        s = settle({
          plan,
          fuel: rental.reservation.vehicle.fuel,
          distanceKm: rental.distanceKm ?? 0,
          lateMinutes: rental.lateMinutes,
        });
      }

      if (s.totalKrw > 0) {
        const upfront = await tx.payment.findFirst({
          where: { reservationId: rental.reservationId, kind: 'UPFRONT' },
        });
        await this.payments.charge(tx, {
          reservationId: rental.reservationId,
          kind: 'DRIVE_SETTLEMENT',
          amountKrw: s.totalKrw,
          idempotencyKey: `settle-${rentalId}`,
          cardLast4: upfront?.cardLast4 ?? '4242',
        });
      }

      await tx.reservation.update({
        where: { id: rental.reservationId },
        data: { status: 'COMPLETED' },
      });

      // 편도: 차량의 물리적 위치를 반납 존으로 갱신 (이후 탐색은 새 존 기준)
      if (rental.reservation.returnZoneId) {
        await tx.vehicle.update({
          where: { id: rental.reservation.vehicleId },
          data: { zoneId: rental.reservation.returnZoneId },
        });
      }

      return tx.rental.update({
        where: { id: rentalId },
        data: {
          status: 'COMPLETED',
          driveFeeKrw: s.driveFeeKrw,
          lateFeeKrw: s.lateFeeKrw,
        },
        include: { reservation: { include: { payments: true, returnZone: true } } },
      });
    });
  }

  private async ownedRental(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    user: JwtUser,
    rentalId: string,
  ) {
    const rental = await tx.rental.findUnique({
      where: { id: rentalId },
      include: { reservation: { include: { vehicle: true } } },
    });
    if (!rental) throw new NotFoundException('대여를 찾을 수 없습니다');
    if (rental.reservation.userId !== user.id && user.role !== 'OPS_ADMIN') {
      throw new ForbiddenException('본인 대여만 처리할 수 있습니다');
    }
    return rental;
  }
}
