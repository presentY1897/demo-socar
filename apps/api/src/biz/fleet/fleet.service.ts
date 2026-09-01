import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FLEET_USAGE_WINDOW_DAYS,
  isLeasePending,
  summarizeUsage,
  type FleetListRes,
  type FleetVehicleDetailRes,
  type FleetVehicleRes,
} from '@socar/shared';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { currentLease, toLeaseRes } from './lease-view';

/** 이용 집계에 쓰는 운행 = 취소되지 않은 예약 */
const USAGE_STATUSES = ['CONFIRMED', 'IN_USE', 'COMPLETED'] as const;

/**
 * 법인 플릿(리스 차량) 현황.
 *
 * 차량·존·예약·대여 테이블을 직접 읽는다 — 배차 추천과 같은 성격의 잔여 결합이고,
 * 법인 서비스를 떼어낼 때 "차량 이용 이력 조회" API로 바뀌어야 하는 지점이다 (ADR-010).
 * 리스 계약(LeaseContract)만이 biz가 소유한 테이블이다.
 */
@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  /** 법인 전용 차량 목록 + 계약 합계 */
  async list(actor: JwtUser): Promise<FleetListRes> {
    const corporationId = this.corpOf(actor);
    const now = new Date();
    const since = this.windowStart(now);

    const vehicles = await this.prisma.vehicle.findMany({
      where: { corporationId },
      include: {
        zone: { select: { id: true, name: true } },
        leaseContracts: { include: { requestedBy: { select: { id: true, name: true } } } },
      },
      orderBy: { modelName: 'asc' },
    });

    const trips = await this.prisma.reservation.findMany({
      where: {
        vehicleId: { in: vehicles.map((v) => v.id) },
        status: { in: [...USAGE_STATUSES] },
        startAt: { gte: since },
      },
      select: { vehicleId: true, startAt: true, endAt: true, rental: { select: { distanceKm: true } } },
    });

    const items: FleetVehicleRes[] = vehicles.map((vehicle) => {
      const lease = currentLease(vehicle.leaseContracts);
      return {
        id: vehicle.id,
        modelName: vehicle.modelName,
        plateNo: vehicle.plateNo,
        fuel: vehicle.fuel,
        seats: vehicle.seats,
        status: vehicle.status,
        zone: vehicle.zone,
        lease: lease ? toLeaseRes(lease, now) : null,
        usage: summarizeUsage(
          trips
            .filter((t) => t.vehicleId === vehicle.id)
            .map((t) => ({ startAt: t.startAt, endAt: t.endAt, distanceKm: t.rental?.distanceKm })),
          FLEET_USAGE_WINDOW_DAYS,
        ),
      };
    });

    const live = items.map((i) => i.lease).filter((l): l is NonNullable<typeof l> => !!l);
    return {
      summary: {
        vehicleCount: items.length,
        activeLeaseCount: live.length,
        monthlyTotalKrw: live.reduce((sum, l) => sum + l.monthlyFeeKrw, 0),
        expiringSoonCount: live.filter((l) => l.expiringSoon).length,
        pendingRequestCount: live.filter((l) => isLeasePending(l.status)).length,
      },
      items,
    };
  }

  /** 차량 상세 — 계약 이력 + 운행일지 + 이용 임직원 통계 */
  async detail(actor: JwtUser, vehicleId: string): Promise<FleetVehicleDetailRes> {
    const corporationId = this.corpOf(actor);
    const now = new Date();
    const since = this.windowStart(now);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        zone: { select: { id: true, name: true } },
        leaseContracts: { include: { requestedBy: { select: { id: true, name: true } } } },
      },
    });
    if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');
    // 등급 권한은 가드가 판정했다. 여기서는 테넌시(다른 법인 침범)만 막는다.
    if (vehicle.corporationId !== corporationId) {
      throw new ForbiddenException('다른 법인의 차량은 조회할 수 없습니다');
    }

    const reservations = await this.prisma.reservation.findMany({
      where: { vehicleId, status: { in: [...USAGE_STATUSES] }, startAt: { gte: since } },
      include: {
        rental: { select: { distanceKm: true, lateMinutes: true, returnedAt: true } },
        user: { select: { id: true, name: true } },
        dispatch: { select: { purpose: true } },
      },
      orderBy: { startAt: 'desc' },
    });

    const usage = summarizeUsage(
      reservations.map((r) => ({
        startAt: r.startAt,
        endAt: r.endAt,
        distanceKm: r.rental?.distanceKm,
      })),
      FLEET_USAGE_WINDOW_DAYS,
    );

    // 이용 임직원 통계 — 같은 집계 창, 이용 시간이 많은 순
    const byMember = new Map<string, { id: string; name: string; trips: typeof reservations }>();
    for (const r of reservations) {
      const entry = byMember.get(r.user.id) ?? { id: r.user.id, name: r.user.name, trips: [] };
      entry.trips.push(r);
      byMember.set(r.user.id, entry);
    }
    const memberUsage = [...byMember.values()]
      .map((m) => {
        const summary = summarizeUsage(
          m.trips.map((t) => ({
            startAt: t.startAt,
            endAt: t.endAt,
            distanceKm: t.rental?.distanceKm,
          })),
          FLEET_USAGE_WINDOW_DAYS,
        );
        return {
          id: m.id,
          name: m.name,
          tripCount: summary.tripCount,
          totalHours: summary.totalHours,
          distanceKm: summary.distanceKm,
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);

    const lease = currentLease(vehicle.leaseContracts);
    return {
      id: vehicle.id,
      modelName: vehicle.modelName,
      plateNo: vehicle.plateNo,
      fuel: vehicle.fuel,
      seats: vehicle.seats,
      status: vehicle.status,
      zone: vehicle.zone,
      lease: lease ? toLeaseRes(lease, now) : null,
      usage,
      // 계약 이력 — 최근 시작 순 (종료된 과거 계약 포함)
      contracts: [...vehicle.leaseContracts]
        .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
        .map((l) => toLeaseRes(l, now)),
      trips: reservations.map((r) => ({
        id: r.id,
        startAt: r.startAt.toISOString(),
        endAt: r.endAt.toISOString(),
        returnedAt: r.rental?.returnedAt?.toISOString() ?? null,
        status: r.status,
        distanceKm: r.rental?.distanceKm ?? null,
        lateMinutes: r.rental?.lateMinutes ?? 0,
        user: r.user,
        purpose: r.dispatch?.purpose ?? null,
      })),
      memberUsage,
    };
  }

  private corpOf(actor: JwtUser): string {
    if (!actor.corporationId) throw new ForbiddenException('법인 소속이 아닙니다');
    return actor.corporationId;
  }

  private windowStart(now: Date): Date {
    return new Date(now.getTime() - FLEET_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  }
}
