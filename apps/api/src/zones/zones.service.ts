import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DELIVERY_MAX_RADIUS_M,
  DELIVERY_MIN_LEAD_MINUTES,
  DELIVERY_PREP_BUFFER_MINUTES,
  deliveryFee,
  haversineMeters,
  quote,
  validateSlotRange,
} from '@socar/shared';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveZoneIdAt } from '../common/vehicle-location';
import { TRAVEL_ESTIMATOR, type TravelTimeEstimator } from '../dispatch/travel/travel-time';

interface TimeRange {
  startAt: Date;
  endAt: Date;
}

/** 쿼리 파라미터의 이용 구간 파싱 (둘 다 없으면 null, 하나만 있거나 무효면 400) */
export function parseRange(startAt?: string, endAt?: string): TimeRange | null {
  if (!startAt && !endAt) return null;
  if (!startAt || !endAt) throw new BadRequestException('startAt과 endAt을 함께 지정해야 합니다');
  const range = { startAt: new Date(startAt), endAt: new Date(endAt) };
  if (Number.isNaN(range.startAt.getTime()) || Number.isNaN(range.endAt.getTime())) {
    throw new BadRequestException('시각 형식이 올바르지 않습니다');
  }
  const err = validateSlotRange(range.startAt, range.endAt);
  if (err) throw new BadRequestException(err);
  return range;
}

@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRAVEL_ESTIMATOR) private readonly travel: TravelTimeEstimator,
  ) {}

  /**
   * 이용 구간의 차량 가용성.
   * 편도 예약을 반영한 "시작 시각의 유효 위치" 기준으로 존별 배치한다.
   */
  private async availableVehiclesByZone(range: TimeRange) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { corporationId: null, status: 'AVAILABLE' },
      include: {
        plan: true,
        reservations: {
          where: { status: { in: ['CONFIRMED', 'IN_USE'] }, startAt: { lt: range.endAt } },
          select: { startAt: true, endAt: true, returnZoneId: true },
        },
      },
    });

    const byZone = new Map<string, typeof vehicles>();
    for (const v of vehicles) {
      const overlaps = v.reservations.some(
        (r) => r.startAt < range.endAt && r.endAt > range.startAt,
      );
      if (overlaps) continue;
      const zoneId = effectiveZoneIdAt(v.zoneId, v.reservations, range.startAt);
      byZone.set(zoneId, [...(byZone.get(zoneId) ?? []), v]);
    }
    return byZone;
  }

  async list(range: TimeRange | null) {
    const zones = await this.prisma.zone.findMany({
      where: { corporationId: null },
      include: {
        _count: {
          select: { vehicles: { where: { status: 'AVAILABLE', corporationId: null } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (!range) {
      return zones.map(({ _count, ...z }) => ({ ...z, vehicleCount: _count.vehicles }));
    }

    const byZone = await this.availableVehiclesByZone(range);
    return zones.map(({ _count, ...z }) => ({
      ...z,
      vehicleCount: byZone.get(z.id)?.length ?? 0,
    }));
  }

  async detail(id: string, range: TimeRange | null) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone || zone.corporationId !== null) throw new NotFoundException('존을 찾을 수 없습니다');

    if (!range) {
      const vehicles = await this.prisma.vehicle.findMany({
        where: { zoneId: id, status: 'AVAILABLE', corporationId: null },
        include: { plan: true },
        orderBy: { modelName: 'asc' },
      });
      return { ...zone, vehicles };
    }

    const byZone = await this.availableVehiclesByZone(range);
    // 이용 구간의 예상 대여요금 (면책상품 제외 — 예약 단계에서 선택)
    const estimatedRentalKrw = (plan: Parameters<typeof quote>[0]['plan']) =>
      quote({ plan, startAt: range.startAt, endAt: range.endAt, insurance: 'LIGHT' }).rentalFeeKrw;

    // ① 이 존에서 바로 픽업 가능한 차량
    const vehicles = (byZone.get(id) ?? [])
      .map(({ reservations: _r, ...v }) => ({ ...v, estimatedRentalKrw: estimatedRentalKrw(v.plan) }))
      .sort((a, b) => a.estimatedRentalKrw - b.estimatedRentalKrw);

    // ② 부름으로 가져와 이용 가능한 차량 — 반경 내 다른 존에 있고 탁송 일정이 맞는 차량
    const deliverable = await this.deliverableVehicles(zone, byZone, range);

    return { ...zone, vehicles, deliverable };
  }

  /**
   * 검색한 존 근처의 다른 존 차량 중, 부름(탁송)으로 시작 시각 전에 가져올 수 있는 후보.
   * 조건은 예약 검증(reservations.service)과 동일: 리드타임 60분 +
   * (직전 반납 or 지금) + 탁송 운전 시간 + 준비 버퍼 ≤ 시작 시각.
   * 요금은 검색 존 기준 추정 — 실제 배달지 핀을 찍으면 예약 단계에서 재계산된다.
   */
  private async deliverableVehicles(
    zone: { id: string; region: string; lat: number; lng: number },
    byZone: Awaited<ReturnType<ZonesService['availableVehiclesByZone']>>,
    range: TimeRange,
  ) {
    const now = Date.now();
    if (range.startAt.getTime() < now + DELIVERY_MIN_LEAD_MINUTES * 60 * 1000) return [];

    const nearby = (await this.prisma.zone.findMany({ where: { corporationId: null } })).filter(
      (z) =>
        z.id !== zone.id &&
        z.region === zone.region &&
        haversineMeters(zone, z) <= DELIVERY_MAX_RADIUS_M,
    );

    const result: object[] = [];
    for (const from of nearby) {
      const candidates = byZone.get(from.id) ?? [];
      if (candidates.length === 0) continue;

      const est = await this.travel.estimateDrive(from, zone, zone.region);
      const arrivalDeadline =
        range.startAt.getTime() - est.seconds * 1000 - DELIVERY_PREP_BUFFER_MINUTES * 60 * 1000;

      for (const v of candidates) {
        const prevEnds = v.reservations
          .filter((r) => r.endAt.getTime() <= range.startAt.getTime())
          .map((r) => r.endAt.getTime());
        const gapStart = Math.max(now, ...prevEnds);
        if (gapStart > arrivalDeadline) continue;

        const { reservations: _r, ...stripped } = v;
        result.push({
          ...stripped,
          estimatedRentalKrw: quote({
            plan: v.plan,
            startAt: range.startAt,
            endAt: range.endAt,
            insurance: 'LIGHT',
          }).rentalFeeKrw,
          fromZone: { id: from.id, name: from.name },
          deliveryFeeEstimateKrw: deliveryFee(est.meters),
          deliveryEtaMinutes: Math.ceil(est.seconds / 60),
        });
      }
    }

    return (result as { estimatedRentalKrw: number; deliveryFeeEstimateKrw: number }[]).sort(
      (a, b) =>
        a.estimatedRentalKrw + a.deliveryFeeEstimateKrw - (b.estimatedRentalKrw + b.deliveryFeeEstimateKrw),
    );
  }

  /** 편도 반납 가능 존: 같은 region의 공유존 (출발 존 제외) */
  async returnZones(region: string, excludeZoneId: string) {
    return this.prisma.zone.findMany({
      where: { region, corporationId: null, id: { not: excludeZoneId } },
      orderBy: { name: 'asc' },
    });
  }
}
