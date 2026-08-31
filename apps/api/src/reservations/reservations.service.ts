import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { quote, SLOT_MS, validateSlotRange, type CreateReservationDto, type QuoteRequestDto } from '@socar/shared';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt-auth.guard';

/** PostgreSQL exclusion_violation (EXCLUDE USING GIST) 여부 */
function isOverlapViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('23P01') || msg.includes('reservation_no_overlap');
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  /** 쿠폰/크레딧을 반영한 서버 기준 견적 (결제 금액의 단일 진실 원천) */
  async quoteFor(db: Prisma.TransactionClient, userId: string, dto: QuoteRequestDto) {
    const vehicle = await db.vehicle.findUnique({
      where: { id: dto.vehicleId },
      include: { plan: true },
    });
    if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');
    if (vehicle.status !== 'AVAILABLE') {
      throw new ConflictException('현재 이용할 수 없는 차량입니다 (정비 중)');
    }
    if (vehicle.corporationId !== null) {
      throw new BadRequestException('법인 전용 차량은 오피스 배차를 통해서만 이용할 수 있습니다');
    }

    let couponDiscountKrw = 0;
    if (dto.couponId) {
      const coupon = await db.coupon.findUnique({ where: { id: dto.couponId } });
      if (!coupon || coupon.userId !== userId) throw new NotFoundException('쿠폰을 찾을 수 없습니다');
      if (coupon.usedAt) throw new BadRequestException('이미 사용한 쿠폰입니다');
      if (coupon.expiresAt < new Date()) throw new BadRequestException('만료된 쿠폰입니다');
      couponDiscountKrw = coupon.discountKrw;
    }

    let creditBalanceKrw = 0;
    if (dto.useCredit) {
      const agg = await db.creditLedger.aggregate({
        where: { userId },
        _sum: { deltaKrw: true },
      });
      creditBalanceKrw = agg._sum.deltaKrw ?? 0;
    }

    const breakdown = quote({
      plan: vehicle.plan,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      insurance: dto.insurance,
      couponDiscountKrw,
      creditBalanceKrw,
      useCredit: dto.useCredit,
    });
    return { vehicle, breakdown };
  }

  /**
   * 법인 전용 차량(FMS)은 이용 과금이 없다 — 소속 법인의 배차 승인 경로에서만 0원 예약.
   * 그 외에는 일반 견적(quoteFor)을 따른다.
   */
  private async resolveBreakdown(
    tx: Prisma.TransactionClient,
    user: JwtUser,
    dto: CreateReservationDto,
    startAt: Date,
    endAt: Date,
    opts: { corporateDedicated?: boolean },
  ) {
    if (!opts.corporateDedicated) {
      return (await this.quoteFor(tx, user.id, dto)).breakdown;
    }

    const vehicle = await tx.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');
    if (vehicle.status !== 'AVAILABLE') {
      throw new ConflictException('현재 이용할 수 없는 차량입니다 (정비 중)');
    }
    if (vehicle.corporationId === null || vehicle.corporationId !== user.corporationId) {
      throw new BadRequestException('소속 법인의 전용 차량이 아닙니다');
    }

    return {
      slotCount: Math.round((endAt.getTime() - startAt.getTime()) / SLOT_MS),
      rentalFeeKrw: 0,
      insuranceFeeKrw: 0,
      discountKrw: 0,
      creditUsedKrw: 0,
      totalUpfrontKrw: 0,
    };
  }

  async create(
    user: JwtUser,
    dto: CreateReservationDto,
    opts: { corporateDedicated?: boolean } = {},
  ) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    const rangeError = validateSlotRange(startAt, endAt);
    if (rangeError) throw new BadRequestException(rangeError);
    if (startAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('과거 시각으로는 예약할 수 없습니다');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const breakdown = await this.resolveBreakdown(tx, user, dto, startAt, endAt, opts);

        // 1차 확인: 겹치는 예약이 있으면 친절한 409 (최종 방어는 DB EXCLUDE 제약)
        const conflicts = await tx.reservation.findMany({
          where: {
            vehicleId: dto.vehicleId,
            status: { in: ['CONFIRMED', 'IN_USE'] },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
          select: { startAt: true, endAt: true },
        });
        if (conflicts.length > 0) {
          throw new ConflictException({
            message: '선택한 시간에 이미 예약이 있습니다',
            busy: conflicts,
          });
        }

        const reservation = await tx.reservation.create({
          data: {
            userId: user.id,
            vehicleId: dto.vehicleId,
            startAt,
            endAt,
            insurance: dto.insurance,
            rentalFeeKrw: breakdown.rentalFeeKrw,
            insuranceFeeKrw: breakdown.insuranceFeeKrw,
            discountKrw: breakdown.discountKrw,
            creditUsedKrw: breakdown.creditUsedKrw,
            totalUpfrontKrw: breakdown.totalUpfrontKrw,
            couponId: dto.couponId ?? null,
          },
        });

        if (dto.couponId) {
          await tx.coupon.update({ where: { id: dto.couponId }, data: { usedAt: new Date() } });
        }
        if (breakdown.creditUsedKrw > 0) {
          await tx.creditLedger.create({
            data: {
              userId: user.id,
              deltaKrw: -breakdown.creditUsedKrw,
              reason: 'USE',
              reservationId: reservation.id,
              memo: '예약 결제 사용',
            },
          });
        }
        if (breakdown.totalUpfrontKrw > 0) {
          await this.payments.charge(tx, {
            reservationId: reservation.id,
            kind: 'UPFRONT',
            amountKrw: breakdown.totalUpfrontKrw,
            idempotencyKey: dto.idempotencyKey,
            cardLast4: dto.cardLast4,
          });
        }

        return tx.reservation.findUniqueOrThrow({
          where: { id: reservation.id },
          include: { vehicle: { include: { zone: true, plan: true } }, payments: true },
        });
      });
    } catch (e) {
      if (isOverlapViolation(e)) {
        throw new ConflictException('선택한 시간에 이미 예약이 있습니다 (동시 요청 충돌)');
      }
      throw e;
    }
  }

  async listMine(userId: string) {
    return this.prisma.reservation.findMany({
      where: { userId },
      include: { vehicle: { include: { zone: true } }, rental: true },
      orderBy: { startAt: 'desc' },
      take: 50,
    });
  }

  async detail(user: JwtUser, id: string) {
    const resv = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        vehicle: { include: { zone: true, plan: true } },
        payments: { orderBy: { createdAt: 'asc' } },
        rental: true,
        coupon: true,
      },
    });
    if (!resv) throw new NotFoundException('예약을 찾을 수 없습니다');
    if (resv.userId !== user.id && user.role !== 'OPS_ADMIN') {
      throw new ForbiddenException('본인 예약만 조회할 수 있습니다');
    }
    return resv;
  }

  async cancel(user: JwtUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const resv = await tx.reservation.findUnique({ where: { id } });
      if (!resv) throw new NotFoundException('예약을 찾을 수 없습니다');
      if (resv.userId !== user.id && user.role !== 'OPS_ADMIN') {
        throw new ForbiddenException('본인 예약만 취소할 수 있습니다');
      }
      if (resv.status !== 'CONFIRMED') {
        throw new BadRequestException('이용 전 예약만 취소할 수 있습니다');
      }
      if (resv.startAt.getTime() <= Date.now()) {
        throw new BadRequestException('시작 시각이 지난 예약은 취소할 수 없습니다');
      }

      await this.payments.refundAll(tx, id);
      if (resv.creditUsedKrw > 0) {
        await tx.creditLedger.create({
          data: {
            userId: resv.userId,
            deltaKrw: resv.creditUsedKrw,
            reason: 'REFUND',
            reservationId: id,
            memo: '예약 취소 환급',
          },
        });
      }
      if (resv.couponId) {
        await tx.coupon.update({ where: { id: resv.couponId }, data: { usedAt: null } });
      }

      return tx.reservation.update({
        where: { id },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
    });
  }
}
