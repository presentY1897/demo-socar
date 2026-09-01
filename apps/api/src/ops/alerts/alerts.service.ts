import { Injectable } from '@nestjs/common';
import {
  EXPIRING_SOON_DAYS,
  LOW_FUEL_PCT,
  type OpsAlertRes,
  type OpsOverviewRes,
} from '@socar/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TelemetryService } from '../../telemetry/telemetry.service';
import { buildOpsAlerts, type AlertInput } from './alert-rules';

const DAY_MS = 24 * 3600 * 1000;

/**
 * 운영 홈이 보는 두 응답 — 상단 스탯(`/ops/overview`)과 경고 피드(`/ops/alerts`).
 *
 * 판정은 alert-rules.ts(순수 함수)가 하고 여기서는 재료만 모은다.
 * 연료 부족은 저장값이 아니라 **조회 시점 계산값**으로 판정한다 — 운행 중인 차의 연료는
 * 지금 이 순간에도 줄고 있어서, 저장값만 보면 경고가 한 박자 늦게 뜬다.
 */
@Injectable()
export class OpsAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
  ) {}

  /** 운영 홈 상단 스탯 */
  async overview(now = new Date()): Promise<OpsOverviewRes> {
    const [telemetry, todayReservationCount, unassignedTaskCount, openInquiryCount, alerts] =
      await Promise.all([
        this.telemetry.currentMany(null, now),
        this.prisma.reservation.count({
          where: { status: { not: 'CANCELED' }, startAt: kstToday(now) },
        }),
        this.prisma.handlerTask.count({ where: { status: 'PENDING' } }),
        this.prisma.inquiry.count({ where: { status: 'OPEN' } }),
        this.alerts(now),
      ]);

    const states = [...telemetry.values()];
    const count = (state: string) => states.filter((t) => t.state === state).length;
    return {
      vehicleCount: states.length,
      inUseCount: count('IN_USE'),
      inTransitCount: count('IN_TRANSIT'),
      idleCount: count('IDLE'),
      maintenanceCount: count('MAINTENANCE'),
      todayReservationCount,
      unassignedTaskCount,
      openInquiryCount,
      alertCount: alerts.length,
    };
  }

  /** 경고 피드 — 연료 부족 · 보험 만기 · 계약 만료 · 지연 반납 진행 중 */
  async alerts(now = new Date()): Promise<OpsAlertRes[]> {
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);

    const [current, vehicles, finances, contracts, lateRentals] = await Promise.all([
      this.telemetry.currentMany(null, now),
      this.prisma.vehicle.findMany({ select: { id: true, modelName: true, plateNo: true, fuel: true } }),
      // 임계 밖은 애초에 읽지 않는다 — 전 차량을 끌어와 메모리에서 거르지 않기 위해
      this.prisma.vehicleFinance.findMany({
        where: { insuranceExpiresAt: { lte: soon } },
        include: { vehicle: { select: { modelName: true, plateNo: true } } },
      }),
      this.prisma.zoneContract.findMany({
        where: { contractEnd: { lte: soon } },
        include: { zone: { select: { name: true } } },
      }),
      this.prisma.rental.findMany({
        where: { status: 'IN_USE', reservation: { endAt: { lt: now } } },
        include: {
          reservation: {
            select: {
              endAt: true,
              user: { select: { id: true, name: true } },
              vehicle: { select: { modelName: true, plateNo: true } },
            },
          },
        },
      }),
    ]);

    const label = (v: { modelName: string; plateNo: string }) => `${v.modelName} ${v.plateNo}`;
    const input: AlertInput = {
      lowFuel: vehicles
        .filter((v) => (current.get(v.id)?.fuelPct ?? 100) < LOW_FUEL_PCT)
        .map((v) => ({
          vehicleId: v.id,
          label: label(v),
          fuel: v.fuel,
          fuelPct: current.get(v.id)!.fuelPct,
        })),
      insuranceExpiring: finances.map((f) => ({
        vehicleId: f.vehicleId,
        label: label(f.vehicle),
        insurerName: f.insurerName,
        expiresAt: f.insuranceExpiresAt,
      })),
      contractExpiring: contracts
        .filter((c) => c.contractEnd !== null)
        .map((c) => ({
          zoneId: c.zoneId,
          zoneName: c.zone.name,
          partnerName: c.partnerName,
          contractEnd: c.contractEnd!,
        })),
      lateReturns: lateRentals.map((r) => ({
        userId: r.reservation.user.id,
        userName: r.reservation.user.name,
        label: label(r.reservation.vehicle),
        endAt: r.reservation.endAt,
      })),
    };

    return buildOpsAlerts(input, now);
  }
}

/** 오늘(KST) 하루 구간 — 서버 타임존과 무관하게 한국 달력 기준으로 센다 */
function kstToday(now: Date): { gte: Date; lt: Date } {
  const KST_OFFSET_MS = 9 * 3600 * 1000;
  const dayStartKst = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS;
  return {
    gte: new Date(dayStartKst - KST_OFFSET_MS),
    lt: new Date(dayStartKst - KST_OFFSET_MS + DAY_MS),
  };
}
