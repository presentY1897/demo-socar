import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DELIVERY_MAX_RADIUS_M,
  DELIVERY_MIN_LEAD_MINUTES,
  DELIVERY_PREP_BUFFER_MINUTES,
  deliveryFee,
  haversineMeters,
  onewayFee,
  quote,
  SLOT_MS,
  validateSlotRange,
  type CreateReservationDto,
  type DeliveryDto,
  type ModifyReservationDto,
  type QuoteBreakdown,
  type QuoteRequestDto,
} from '@socar/shared';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveZoneIdAt, type ChainReservation } from '../common/vehicle-location';
import { TRAVEL_ESTIMATOR, type TravelTimeEstimator } from '../common/travel/travel-time';
import type { JwtUser } from '../auth/jwt-auth.guard';

/** 탁송 준비 버퍼 — 직전 반납 후 기사 배정·출발 준비 시간 */
const DELIVERY_PREP_BUFFER_MS = DELIVERY_PREP_BUFFER_MINUTES * 60 * 1000;

/** PostgreSQL exclusion_violation (EXCLUDE USING GIST) 여부 */
function isOverlapViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('23P01') || msg.includes('reservation_no_overlap');
}

interface QuoteResult {
  breakdown: QuoteBreakdown;
  returnZoneId: string | null;
  delivery: DeliveryDto | null;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(TRAVEL_ESTIMATOR) private readonly travel: TravelTimeEstimator,
  ) {}

  /**
   * 쿠폰/크레딧/편도 수수료를 반영한 서버 기준 견적 (결제 금액의 단일 진실 원천).
   * 편도면 출발 존은 "시작 시각의 유효 위치"(편도 체인 반영) 기준으로 수수료를 계산한다.
   */
  async quoteFor(db: Prisma.TransactionClient, userId: string, dto: QuoteRequestDto): Promise<QuoteResult> {
    const vehicle = await db.vehicle.findUnique({
      where: { id: dto.vehicleId },
      include: {
        plan: true,
        reservations: {
          where: { status: { in: ['CONFIRMED', 'IN_USE'] } },
          select: { startAt: true, endAt: true, returnZoneId: true },
        },
      },
    });
    if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');
    if (vehicle.status !== 'AVAILABLE') {
      throw new ConflictException('현재 이용할 수 없는 차량입니다 (정비 중)');
    }
    if (vehicle.corporationId !== null) {
      throw new BadRequestException('법인 전용 차량은 오피스 배차를 통해서만 이용할 수 있습니다');
    }

    const startAtDate = new Date(dto.startAt);
    const startZoneId = effectiveZoneIdAt(vehicle.zoneId, vehicle.reservations, startAtDate);

    // 편도 반납 존 검증 + 수수료
    let onewayFeeKrw = 0;
    let returnZoneId: string | null = null;
    if (dto.returnZoneId && dto.returnZoneId !== startZoneId) {
      const [startZone, returnZone] = await Promise.all([
        db.zone.findUnique({ where: { id: startZoneId } }),
        db.zone.findUnique({ where: { id: dto.returnZoneId } }),
      ]);
      if (!returnZone || returnZone.corporationId !== null) {
        throw new NotFoundException('반납 존을 찾을 수 없습니다');
      }
      if (!startZone || returnZone.region !== startZone.region) {
        throw new BadRequestException('같은 지역의 존으로만 편도 반납이 가능합니다');
      }
      onewayFeeKrw = onewayFee(haversineMeters(startZone, returnZone));
      returnZoneId = returnZone.id;
    }

    // 부름(탁송) 검증 + 요금 — 반경, 리드타임, 직전 반납 후 탁송 가능 시간
    let deliveryFeeKrw = 0;
    let delivery: DeliveryDto | null = null;
    if (dto.delivery) {
      const startZone = await db.zone.findUnique({ where: { id: startZoneId } });
      if (!startZone) throw new NotFoundException('출발 존을 찾을 수 없습니다');

      if (haversineMeters(startZone, dto.delivery) > DELIVERY_MAX_RADIUS_M) {
        throw new BadRequestException(
          `부름은 존 반경 ${DELIVERY_MAX_RADIUS_M / 1000}km 안에서만 가능해요`,
        );
      }
      if (startAtDate.getTime() < Date.now() + DELIVERY_MIN_LEAD_MINUTES * 60 * 1000) {
        throw new BadRequestException(
          `부름은 최소 ${DELIVERY_MIN_LEAD_MINUTES}분 이후 시각부터 예약할 수 있어요`,
        );
      }

      const est = await this.travel.estimateDrive(startZone, dto.delivery, startZone.region);
      // 직전 예약 반납(없으면 지금)부터 탁송이 시작 시각 전에 도착할 수 있어야 한다
      const prevEnds = vehicle.reservations
        .filter((r) => r.endAt.getTime() <= startAtDate.getTime())
        .map((r) => r.endAt.getTime());
      const gapStart = Math.max(Date.now(), ...prevEnds);
      if (gapStart + est.seconds * 1000 + DELIVERY_PREP_BUFFER_MS > startAtDate.getTime()) {
        throw new ConflictException(
          '직전 반납 일정상 탁송 시간이 부족해요. 시작 시각을 늦추거나 다른 차량을 선택해 주세요',
        );
      }

      deliveryFeeKrw = deliveryFee(est.meters);
      delivery = dto.delivery;
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
      startAt: startAtDate,
      endAt: new Date(dto.endAt),
      insurance: dto.insurance,
      onewayFeeKrw,
      deliveryFeeKrw,
      couponDiscountKrw,
      creditBalanceKrw,
      useCredit: dto.useCredit,
    });
    return { breakdown, returnZoneId, delivery };
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
        const { breakdown, returnZoneId, delivery } = await this.resolveQuote(tx, user, dto, startAt, endAt, opts);

        // 1차 확인: 겹치는 예약이 있으면 친절한 409 (최종 방어는 DB EXCLUDE 제약)
        await this.assertNoOverlap(tx, dto.vehicleId, startAt, endAt);

        const reservation = await tx.reservation.create({
          data: {
            userId: user.id,
            vehicleId: dto.vehicleId,
            startAt,
            endAt,
            insurance: dto.insurance,
            returnZoneId,
            deliveryLat: delivery?.lat ?? null,
            deliveryLng: delivery?.lng ?? null,
            deliveryLabel: delivery?.label ?? null,
            rentalFeeKrw: breakdown.rentalFeeKrw,
            insuranceFeeKrw: breakdown.insuranceFeeKrw,
            onewayFeeKrw: breakdown.onewayFeeKrw,
            deliveryFeeKrw: breakdown.deliveryFeeKrw,
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
          include: {
            vehicle: { include: { zone: true, plan: true } },
            returnZone: true,
            payments: true,
          },
        });
      });
    } catch (e) {
      if (isOverlapViolation(e)) {
        throw new ConflictException('선택한 시간에 이미 예약이 있습니다 (동시 요청 충돌)');
      }
      throw e;
    }
  }

  /**
   * 이용 전 예약 시간 변경.
   * 쿠폰 할인과 기존 크레딧 사용분은 유지하고, 선결제 차액만 추가 결제하거나
   * 크레딧으로 환급한다 (모의 PG에는 부분 환불이 없다 — ADR-002).
   */
  async modify(user: JwtUser, id: string, dto: ModifyReservationDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const rangeError = validateSlotRange(startAt, endAt);
    if (rangeError) throw new BadRequestException(rangeError);
    if (startAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('과거 시각으로는 변경할 수 없습니다');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const resv = await tx.reservation.findUnique({
          where: { id },
          include: { vehicle: { include: { plan: true } }, coupon: true },
        });
        if (!resv) throw new NotFoundException('예약을 찾을 수 없습니다');
        if (resv.userId !== user.id) throw new ForbiddenException('본인 예약만 변경할 수 있습니다');
        if (resv.status !== 'CONFIRMED') throw new BadRequestException('이용 전 예약만 변경할 수 있습니다');
        if (resv.startAt.getTime() <= Date.now()) {
          throw new BadRequestException('시작 시각이 지난 예약은 변경할 수 없습니다');
        }
        if (resv.deliveryLabel) {
          // 탁송 일정 재검증이 얽히므로 데모에서는 미지원 — 취소 후 재예약 안내
          throw new BadRequestException(
            '부름 예약은 시간·반납 존 변경 대신 취소 후 다시 예약해 주세요',
          );
        }

        await this.assertNoOverlap(tx, resv.vehicleId, startAt, endAt, id);

        // 이 차량의 나머지 미완료 예약 = 편도 위치 체인의 나머지 항목 (ADR-005)
        const others = await tx.reservation.findMany({
          where: {
            vehicleId: resv.vehicleId,
            id: { not: id },
            status: { in: ['CONFIRMED', 'IN_USE'] },
          },
          select: { startAt: true, endAt: true, returnZoneId: true },
        });

        const { returnZoneId, onewayFeeKrw } = await this.resolveReturnZoneChange(
          tx,
          resv,
          others,
          startAt,
          dto,
        );
        this.assertLocationChainIntact(
          resv.vehicle.zoneId,
          others,
          { endAt: resv.endAt, returnZoneId: resv.returnZoneId },
          { endAt, returnZoneId },
        );

        const breakdown = quote({
          plan: resv.vehicle.plan,
          startAt,
          endAt,
          insurance: resv.insurance,
          onewayFeeKrw,
          couponDiscountKrw: resv.coupon?.discountKrw ?? 0,
          creditBalanceKrw: resv.creditUsedKrw, // 기존 사용분 한도 내 유지
          useCredit: resv.creditUsedKrw > 0,
        });

        const creditRefund = resv.creditUsedKrw - breakdown.creditUsedKrw;
        if (creditRefund > 0) {
          await tx.creditLedger.create({
            data: {
              userId: user.id,
              deltaKrw: creditRefund,
              reason: 'REFUND',
              reservationId: id,
              memo: '예약 변경 크레딧 환급',
            },
          });
        }

        const delta = breakdown.totalUpfrontKrw - resv.totalUpfrontKrw;
        if (delta > 0) {
          const upfront = await tx.payment.findFirst({
            where: { reservationId: id, kind: 'UPFRONT' },
          });
          await this.payments.charge(tx, {
            reservationId: id,
            kind: 'UPFRONT',
            amountKrw: delta,
            idempotencyKey: dto.idempotencyKey,
            cardLast4: upfront?.cardLast4 ?? '4242',
          });
        } else if (delta < 0) {
          await tx.creditLedger.create({
            data: {
              userId: user.id,
              deltaKrw: -delta,
              reason: 'REFUND',
              reservationId: id,
              memo: '예약 변경 차액 환급 (크레딧)',
            },
          });
        }

        return tx.reservation.update({
          where: { id },
          data: {
            startAt,
            endAt,
            returnZoneId,
            rentalFeeKrw: breakdown.rentalFeeKrw,
            insuranceFeeKrw: breakdown.insuranceFeeKrw,
            onewayFeeKrw: breakdown.onewayFeeKrw,
            discountKrw: breakdown.discountKrw,
            creditUsedKrw: breakdown.creditUsedKrw,
            totalUpfrontKrw: breakdown.totalUpfrontKrw,
          },
          include: { vehicle: { include: { zone: true } }, returnZone: true, payments: true },
        });
      });
    } catch (e) {
      if (isOverlapViolation(e)) {
        throw new ConflictException('변경하려는 시간에 이미 예약이 있습니다');
      }
      throw e;
    }
  }

  async listMine(userId: string) {
    return this.prisma.reservation.findMany({
      where: { userId },
      include: { vehicle: { include: { zone: true } }, returnZone: true, rental: true },
      orderBy: { startAt: 'desc' },
      take: 50,
    });
  }

  async detail(user: JwtUser, id: string) {
    const resv = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        vehicle: { include: { zone: true, plan: true } },
        returnZone: true,
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

  /**
   * 예약 변경의 반납 존 재검증 + 편도 수수료 재견적.
   *
   * 출발 존은 "새 시작 시각의 유효 위치"라서(ADR-005) 반납 존을 그대로 둬도 시간만 바뀌면
   * 수수료가 달라질 수 있다. 그래서 편도 예약은 매번 다시 계산한다.
   */
  private async resolveReturnZoneChange(
    tx: Prisma.TransactionClient,
    resv: {
      returnZoneId: string | null;
      vehicle: { zoneId: string; corporationId: string | null };
    },
    others: ChainReservation[],
    startAt: Date,
    dto: ModifyReservationDto,
  ): Promise<{ returnZoneId: string | null; onewayFeeKrw: number }> {
    // 생략 = 기존 반납 존 유지, null = 왕복 전환
    const requested = dto.returnZoneId === undefined ? resv.returnZoneId : dto.returnZoneId;
    if (!requested) return { returnZoneId: null, onewayFeeKrw: 0 };

    if (resv.vehicle.corporationId !== null) {
      throw new BadRequestException('법인 전용 차량은 존 왕복만 가능합니다');
    }

    const startZoneId = effectiveZoneIdAt(resv.vehicle.zoneId, others, startAt);
    // 출발 존과 같은 곳을 고르면 왕복이다 (create/quote와 같은 판정)
    if (requested === startZoneId) return { returnZoneId: null, onewayFeeKrw: 0 };

    const [startZone, returnZone] = await Promise.all([
      tx.zone.findUnique({ where: { id: startZoneId } }),
      tx.zone.findUnique({ where: { id: requested } }),
    ]);
    if (!returnZone || returnZone.corporationId !== null) {
      throw new NotFoundException('반납 존을 찾을 수 없습니다');
    }
    if (!startZone || returnZone.region !== startZone.region) {
      throw new BadRequestException('같은 지역의 존으로만 편도 반납이 가능합니다');
    }
    return {
      returnZoneId: returnZone.id,
      onewayFeeKrw: onewayFee(haversineMeters(startZone, returnZone)),
    };
  }

  /**
   * 반납 존이나 반납 시각이 바뀌면 이 차량의 "이후 예약이 시작하는 존"이 달라질 수 있다.
   * 그 예약은 원래 존에서 픽업하기로 결제까지 끝난 상태라 뒤늦게 차를 옮길 수 없다 —
   * 변경 전후로 다른 예약의 출발 존이 하나라도 달라지면 거부한다 (ADR-005).
   */
  private assertLocationChainIntact(
    baseZoneId: string,
    others: (ChainReservation & { startAt: Date })[],
    before: ChainReservation,
    after: ChainReservation,
  ) {
    for (const r of others) {
      const beforeZoneId = effectiveZoneIdAt(baseZoneId, [...others, before], r.startAt);
      const afterZoneId = effectiveZoneIdAt(baseZoneId, [...others, after], r.startAt);
      if (beforeZoneId !== afterZoneId) {
        throw new ConflictException({
          message:
            '이 차량의 다음 예약이 시작하는 존이 달라져 변경할 수 없습니다. 취소 후 다시 예약해 주세요',
          conflictAt: r.startAt,
        });
      }
    }
  }

  /** 겹치는 예약이 있으면 친절한 409 (자기 자신은 제외) */
  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const conflicts = await tx.reservation.findMany({
      where: {
        vehicleId,
        id: excludeId ? { not: excludeId } : undefined,
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
  }

  /**
   * 법인 전용 차량(FMS)은 이용 과금이 없다 — 소속 법인의 배차 승인 경로에서만 0원 예약.
   * 그 외에는 일반 견적(quoteFor)을 따른다.
   */
  private async resolveQuote(
    tx: Prisma.TransactionClient,
    user: JwtUser,
    dto: CreateReservationDto,
    startAt: Date,
    endAt: Date,
    opts: { corporateDedicated?: boolean },
  ): Promise<QuoteResult> {
    if (!opts.corporateDedicated) {
      return this.quoteFor(tx, user.id, dto);
    }

    if (dto.returnZoneId || dto.delivery) {
      throw new BadRequestException('법인 전용 차량은 존 왕복만 가능합니다');
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
      returnZoneId: null,
      delivery: null,
      breakdown: {
        slotCount: Math.round((endAt.getTime() - startAt.getTime()) / SLOT_MS),
        rentalFeeKrw: 0,
        insuranceFeeKrw: 0,
        onewayFeeKrw: 0,
        deliveryFeeKrw: 0,
        discountKrw: 0,
        creditUsedKrw: 0,
        totalUpfrontKrw: 0,
      },
    };
  }
}
