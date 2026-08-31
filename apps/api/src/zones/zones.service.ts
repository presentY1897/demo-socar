import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { quote, validateSlotRange } from '@socar/shared';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveZoneIdAt } from '../common/vehicle-location';

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
  constructor(private readonly prisma: PrismaService) {}

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
    const vehicles = (byZone.get(id) ?? [])
      .map(({ reservations: _r, ...v }) => ({
        ...v,
        // 이용 구간의 예상 대여요금 (면책상품 제외 — 예약 단계에서 선택)
        estimatedRentalKrw: quote({
          plan: v.plan,
          startAt: range.startAt,
          endAt: range.endAt,
          insurance: 'LIGHT',
        }).rentalFeeKrw,
      }))
      .sort((a, b) => a.estimatedRentalKrw - b.estimatedRentalKrw);
    return { ...zone, vehicles };
  }

  /** 편도 반납 가능 존: 같은 region의 공유존 (출발 존 제외) */
  async returnZones(region: string, excludeZoneId: string) {
    return this.prisma.zone.findMany({
      where: { region, corporationId: null, id: { not: excludeZoneId } },
      orderBy: { name: 'asc' },
    });
  }
}
