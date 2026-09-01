import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  expiryDDay,
  isExpiringSoon,
  isLowFuel,
  sortFleet,
  type CreateMaintenanceNoteDto,
  type CreateOpsVehicleDto,
  type OpsFleetDetailRes,
  type OpsFleetQueryDto,
  type OpsFleetVehicleRes,
  type OpsMaintenanceNoteRes,
  type OpsVehicleFinanceRes,
  type PricingPlanRes,
} from '@socar/shared';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { initialTelemetry } from '../../telemetry/telemetry-defaults';
import { toTelemetryRes, type CurrentTelemetry, TelemetryService } from '../../telemetry/telemetry.service';

/** 상세 패널이 보여주는 조작 이력 길이 — 최근 것만 본다 */
const CONTROL_LOG_LIMIT = 20;
const NOTE_LIMIT = 20;

const FLEET_INCLUDE = {
  zone: { select: { id: true, name: true } },
  finance: true,
} satisfies Prisma.VehicleInclude;

type FleetRow = Prisma.VehicleGetPayload<{ include: typeof FLEET_INCLUDE }>;

/**
 * Fleet — 운영자가 차를 한눈에 보고 한 대를 파고드는 화면의 백엔드 (M3-3).
 *
 * 목록은 차량 수만큼 질의를 늘리지 않는다: 차량·다음 예약·텔레메트리를 각각 한 번씩만 읽고
 * 메모리에서 맞춘다. 텔레메트리는 저장값이 아니라 조회 시점 계산값이라 운행 중인 차의
 * 연료·주행거리가 목록에서도 실시간으로 보인다.
 */
@Injectable()
export class OpsFleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
  ) {}

  /** 전 차량 표 — 상태/존 필터 */
  async list(query: OpsFleetQueryDto, now = new Date()): Promise<OpsFleetVehicleRes[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { zoneId: query.zoneId },
      include: FLEET_INCLUDE,
      orderBy: { plateNo: 'asc' },
    });
    if (vehicles.length === 0) return [];

    const ids = vehicles.map((v) => v.id);
    const [telemetry, upcoming] = await Promise.all([
      this.telemetry.currentMany(ids, now),
      this.nextReservations(ids, now),
    ]);

    const rows = vehicles.map((v) => this.toRes(v, telemetry.get(v.id)!, upcoming.get(v.id), now));
    // 상태 필터는 계산 결과(대기/운행/탁송/정비)에 걸리므로 DB where로는 못 좁힌다
    const filtered = query.state ? rows.filter((r) => r.state === query.state) : rows;
    // 정렬도 계산값(연료·주행거리·다음 예약)에 걸린다. 규칙은 화면과 같은 함수(shared) —
    // Export가 표에서 본 순서 그대로 나가야 해서 M4-4에서 서버로 끌어왔다
    return sortFleet(filtered, query.sort, query.dir);
  }

  /** 상세 — 센서 + 스마트키 조작 이력 + 도입/보험 + 정비 메모 */
  async detail(id: string, now = new Date()): Promise<OpsFleetDetailRes> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id }, include: FLEET_INCLUDE });
    if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');

    const [telemetry, upcoming, controlLogs, notes] = await Promise.all([
      this.telemetry.currentMany([id], now),
      this.nextReservations([id], now),
      this.prisma.vehicleControlLog.findMany({
        where: { vehicleId: id },
        orderBy: { at: 'desc' },
        take: CONTROL_LOG_LIMIT,
      }),
      this.prisma.vehicleMaintenanceNote.findMany({
        where: { vehicleId: id },
        orderBy: { createdAt: 'desc' },
        take: NOTE_LIMIT,
        include: { author: { select: { name: true } } },
      }),
    ]);

    return {
      ...this.toRes(vehicle, telemetry.get(id)!, upcoming.get(id), now),
      finance: this.toFinanceRes(vehicle.finance, now),
      controlLogs: controlLogs.map((l) => ({
        id: l.id,
        action: l.action,
        at: l.at.toISOString(),
        rentalId: l.rentalId,
      })),
      maintenanceNotes: notes.map(toNoteRes),
    };
  }

  /**
   * 등록 폼의 요금제 선택지.
   *
   * 요금제 id는 시드가 만든 cuid라 화면이 손으로 적을 수 없다 — 차량 등록 폼(M3-4)에
   * 셀렉트를 채우려면 목록이 필요해서 읽기 전용으로 하나 연다. 소비자 화면은 차량에
   * 실려 오는 plan을 그대로 쓰므로 이 목록을 쓰는 곳은 등록 폼뿐이다.
   */
  plans(): Promise<PricingPlanRes[]> {
    return this.prisma.pricingPlan.findMany({ orderBy: { baseHourlyKrw: 'asc' } });
  }

  /**
   * 차량 등록 — 차량 + 도입/보험 + 텔레메트리를 한 트랜잭션에.
   * 도입 정보 없이 차만 생기면 회계 탭의 비용이 조용히 틀어지고, 텔레메트리가 없으면
   * Fleet 표에서 그 차만 값이 비어 보인다. 셋은 함께 태어나야 한다.
   */
  async create(dto: CreateOpsVehicleDto): Promise<OpsFleetDetailRes> {
    const [zone, plan, duplicate] = await Promise.all([
      this.prisma.zone.findUnique({ where: { id: dto.zoneId } }),
      this.prisma.pricingPlan.findUnique({ where: { id: dto.planId } }),
      this.prisma.vehicle.findUnique({ where: { plateNo: dto.plateNo } }),
    ]);
    if (!zone) throw new NotFoundException('존을 찾을 수 없습니다');
    if (!plan) throw new NotFoundException('요금제를 찾을 수 없습니다');
    if (duplicate) throw new ConflictException('이미 등록된 차량 번호입니다');

    const vehicle = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          modelName: dto.modelName,
          plateNo: dto.plateNo,
          fuel: dto.fuel,
          seats: dto.seats,
          zoneId: zone.id,
          planId: plan.id,
          imageUrl: dto.imageUrl ?? null,
        },
      });
      await tx.vehicleFinance.create({
        data: {
          vehicleId: created.id,
          acquisitionType: dto.acquisitionType,
          acquisitionCostKrw: dto.acquisitionCostKrw ?? null,
          monthlyLeaseKrw: dto.monthlyLeaseKrw ?? null,
          acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : new Date(),
          insurerName: dto.insurerName,
          insurancePremiumKrw: dto.insurancePremiumKrw,
          insuranceExpiresAt: new Date(dto.insuranceExpiresAt),
        },
      });
      await tx.vehicleTelemetry.create({
        data: { vehicleId: created.id, ...initialTelemetry(created.id, zone) },
      });
      return created;
    });

    return this.detail(vehicle.id);
  }

  /** 정비 메모 추가 (M3-4 상세 패널) */
  async addNote(
    user: JwtUser,
    vehicleId: string,
    dto: CreateMaintenanceNoteDto,
  ): Promise<OpsMaintenanceNoteRes> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');

    const note = await this.prisma.vehicleMaintenanceNote.create({
      data: { vehicleId, body: dto.body, authorId: user.id },
      include: { author: { select: { name: true } } },
    });
    return toNoteRes(note);
  }

  /**
   * 차량별 "다음 예약" 1건 — 지금 진행 중인 것이 있으면 그것, 없으면 가장 이른 예정 건.
   * 진행 중 예약은 반납 예정 시각이 지났어도(지연 반납) 포함한다 — 차를 쥐고 있는 건 그 예약이라
   * 표에서 빈칸으로 두면 "누가 타고 있는지"를 알 수 없다.
   */
  private async nextReservations(vehicleIds: string[], now: Date) {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        OR: [{ status: 'IN_USE' }, { status: 'CONFIRMED', endAt: { gt: now } }],
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        vehicleId: true,
        startAt: true,
        endAt: true,
        user: { select: { name: true } },
      },
    });
    const byVehicle = new Map<string, (typeof reservations)[number]>();
    for (const r of reservations) if (!byVehicle.has(r.vehicleId)) byVehicle.set(r.vehicleId, r);
    return byVehicle;
  }

  private toRes(
    vehicle: FleetRow,
    telemetry: CurrentTelemetry,
    next: { id: string; startAt: Date; endAt: Date; user: { name: string } } | undefined,
    now: Date,
  ): OpsFleetVehicleRes {
    const finance = vehicle.finance;
    const dDay = finance ? expiryDDay(finance.insuranceExpiresAt, now) : 0;
    return {
      id: vehicle.id,
      modelName: vehicle.modelName,
      plateNo: vehicle.plateNo,
      fuel: vehicle.fuel,
      seats: vehicle.seats,
      status: vehicle.status,
      state: telemetry.state,
      corporationId: vehicle.corporationId,
      zone: vehicle.zone,
      telemetry: toTelemetryRes(telemetry),
      lowFuel: isLowFuel(telemetry.fuelPct),
      nextReservation: next
        ? {
            id: next.id,
            startAt: next.startAt.toISOString(),
            endAt: next.endAt.toISOString(),
            userName: next.user.name,
          }
        : null,
      insurance: finance
        ? {
            insurerName: finance.insurerName,
            expiresAt: finance.insuranceExpiresAt.toISOString(),
            dDay,
            expiringSoon: isExpiringSoon(dDay),
          }
        : null,
    };
  }

  private toFinanceRes(finance: FleetRow['finance'], now: Date): OpsVehicleFinanceRes | null {
    if (!finance) return null;
    const insuranceDDay = expiryDDay(finance.insuranceExpiresAt, now);
    return {
      acquisitionType: finance.acquisitionType,
      acquisitionCostKrw: finance.acquisitionCostKrw,
      monthlyLeaseKrw: finance.monthlyLeaseKrw,
      acquiredAt: finance.acquiredAt.toISOString(),
      insurerName: finance.insurerName,
      insurancePremiumKrw: finance.insurancePremiumKrw,
      insuranceExpiresAt: finance.insuranceExpiresAt.toISOString(),
      insuranceDDay,
      insuranceExpiringSoon: isExpiringSoon(insuranceDDay),
    };
  }
}

const toNoteRes = (note: {
  id: string;
  vehicleId: string;
  body: string;
  createdAt: Date;
  author: { name: string } | null;
}) => ({
  id: note.id,
  vehicleId: note.vehicleId,
  body: note.body,
  authorName: note.author?.name ?? null,
  createdAt: note.createdAt.toISOString(),
});
