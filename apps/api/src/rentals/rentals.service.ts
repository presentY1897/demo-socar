import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { settle } from '@socar/shared';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt-auth.guard';

/**
 * 대여 라이프사이클 상태 머신.
 *
 *   Reservation(CONFIRMED) --문열기--> Rental(IN_USE) + Reservation(IN_USE)
 *   Rental(IN_USE) --반납접수--> Rental(RETURN_PENDING, 주행거리 확정)
 *   Rental(RETURN_PENDING) --정산성공--> Rental(COMPLETED) + Reservation(COMPLETED)
 *
 * 정산 결제가 실패하면 RETURN_PENDING에 머물고 재시도(settle)가 가능하다.
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

  /** 반납 접수: 주행거리 확정 후 정산 시도 */
  async requestReturn(user: JwtUser, rentalId: string, distanceKm: number) {
    if (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 5000) {
      throw new BadRequestException('주행거리가 올바르지 않습니다');
    }

    await this.prisma.$transaction(async (tx) => {
      const rental = await this.ownedRental(tx, user, rentalId);
      if (rental.status !== 'IN_USE') throw new BadRequestException('이용 중인 대여만 반납할 수 있습니다');

      const returnedAt = new Date();
      const lateMs = returnedAt.getTime() - rental.reservation.endAt.getTime();
      const lateMinutes = Math.max(0, Math.ceil(lateMs / 60000));

      await tx.rental.update({
        where: { id: rentalId },
        data: { status: 'RETURN_PENDING', returnedAt, distanceKm, lateMinutes },
      });
    });

    return this.settleReturn(user, rentalId);
  }

  /** 주행요금 + 지연요금 정산 (실패 시 재시도 가능) */
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
      return tx.rental.update({
        where: { id: rentalId },
        data: {
          status: 'COMPLETED',
          driveFeeKrw: s.driveFeeKrw,
          lateFeeKrw: s.lateFeeKrw,
        },
        include: { reservation: { include: { payments: true } } },
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
