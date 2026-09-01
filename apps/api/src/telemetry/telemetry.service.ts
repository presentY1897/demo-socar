import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, VehicleTelemetry } from '@prisma/client';
import type { Coord, OpsVehicleState, SmartKeyState, VehicleTelemetryRes } from '@socar/shared';
import { TRAVEL_ESTIMATOR, type TravelTimeEstimator } from '../common/travel/travel-time';
import {
  fromPlace,
  HANDLER_TASK_INCLUDE,
  taskRegion,
  toPlace,
  type HandlerTaskRow,
} from '../handler/handler-task.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { initialTelemetry } from './telemetry-defaults';
import {
  projectTelemetry,
  turnaroundPoint,
  type TelemetrySnapshot,
  type VehicleMotion,
} from './telemetry-mock';

/** 트랜잭션 안팎에서 같은 헬퍼를 쓰기 위한 클라이언트 타입 */
export type TelemetryDb = PrismaService | Prisma.TransactionClient;

/**
 * 계산값을 도로 저장하는 간격(write-through).
 * 조회 때마다 쓰면 SSE 5초 틱이 전 차량 UPDATE가 된다. 반대로 아예 안 쓰면 저장값이
 * 영원히 옛날 값으로 남아 "마지막 확정 시점"이라는 의미를 잃는다. 1분이 그 사이의 타협.
 */
export const WRITE_THROUGH_MS = 60_000;

/** 조회 시점의 센서 값 + 그 차가 지금 뭘 하고 있는지 */
export interface CurrentTelemetry extends TelemetrySnapshot {
  vehicleId: string;
  state: OpsVehicleState;
}

/** 계산에 필요한 만큼만 읽은 차량 */
const VEHICLE_SELECT = {
  id: true,
  fuel: true,
  status: true,
  zone: { select: { id: true, lat: true, lng: true } },
  telemetry: true,
} satisfies Prisma.VehicleSelect;

type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof VEHICLE_SELECT }>;

/**
 * 차량 텔레메트리 — 저장(M3-1) + 조회 시점 계산(M3-2).
 *
 * 백그라운드 워커가 없다. 읽는 쪽이 "저장값 + 경과 시간"으로 현재값을 만들고,
 * 저장값이 1분 넘게 묵었고 실제로 움직였을 때만 도로 저장한다(write-through).
 * 계산 규칙 자체는 telemetry-mock.ts(순수 함수)에 있고 여기서는 재료만 모은다 —
 * "지금 이 차가 대여 중인가, 탁송 중인가, 서 있는가".
 */
@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRAVEL_ESTIMATOR) private readonly travel: TravelTimeEstimator,
  ) {}

  /** 텔레메트리 행을 보장하고 돌려준다 — 없으면 배정 존 좌표로 초기값을 만든다 */
  async ensure(db: TelemetryDb, vehicleId: string): Promise<VehicleTelemetry> {
    const existing = await db.vehicleTelemetry.findUnique({ where: { vehicleId } });
    if (existing) return existing;

    const vehicle = await db.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      include: { zone: { select: { lat: true, lng: true } } },
    });
    return db.vehicleTelemetry.create({
      data: { vehicleId, ...initialTelemetry(vehicleId, vehicle.zone) },
    });
  }

  /** 스마트키 조작 결과를 반영한다 (M1-4의 Vehicle 임시 필드를 대체) */
  async applySmartKey(
    db: TelemetryDb,
    vehicleId: string,
    state: SmartKeyState,
  ): Promise<VehicleTelemetry> {
    await this.ensure(db, vehicleId);
    return db.vehicleTelemetry.update({ where: { vehicleId }, data: state });
  }

  /** 차량 1대의 현재값 */
  async current(vehicleId: string, now = new Date()): Promise<CurrentTelemetry> {
    const map = await this.currentMany([vehicleId], now);
    return map.get(vehicleId)!;
  }

  /**
   * 여러 대의 현재값을 한 번에.
   *
   * Fleet 목록과 SSE가 전 차량을 훑기 때문에 차량마다 질의를 날리면 안 된다 —
   * 차량·진행 중 대여·이동 중 작업을 각각 한 번씩만 읽고 메모리에서 맞춘다.
   * `vehicleIds`가 null이면 전 차량.
   */
  async currentMany(
    vehicleIds: string[] | null,
    now = new Date(),
  ): Promise<Map<string, CurrentTelemetry>> {
    const where = vehicleIds ? { id: { in: vehicleIds } } : {};
    const vehicles = await this.prisma.vehicle.findMany({ where, select: VEHICLE_SELECT });
    if (vehicles.length === 0) return new Map();

    const ids = vehicles.map((v) => v.id);
    const [rentals, tasks] = await Promise.all([
      this.prisma.rental.findMany({
        where: { status: 'IN_USE', reservation: { vehicleId: { in: ids } } },
        include: {
          reservation: {
            select: {
              vehicleId: true,
              endAt: true,
              deliveryLat: true,
              deliveryLng: true,
              returnZone: { select: { lat: true, lng: true } },
            },
          },
        },
      }),
      this.prisma.handlerTask.findMany({
        where: { status: 'EN_ROUTE', vehicleId: { in: ids } },
        include: HANDLER_TASK_INCLUDE,
      }),
    ]);
    const rentalByVehicle = new Map(rentals.map((r) => [r.reservation.vehicleId, r]));
    const taskByVehicle = new Map(tasks.map((t) => [t.vehicleId, t]));

    // 텔레메트리 행이 없는 차량(수기 생성·과거 데이터)은 여기서 만들어 준다
    const missing = vehicles.filter((v) => v.telemetry === null);
    if (missing.length > 0) {
      await this.prisma.vehicleTelemetry.createMany({
        data: missing.map((v) => ({ vehicleId: v.id, ...initialTelemetry(v.id, v.zone) })),
        skipDuplicates: true,
      });
    }

    const result = new Map<string, CurrentTelemetry>();
    const writeBack: { vehicleId: string; snapshot: TelemetrySnapshot }[] = [];

    for (const vehicle of vehicles) {
      const stored = toSnapshot(vehicle, now);
      const rental = rentalByVehicle.get(vehicle.id);
      const task = taskByVehicle.get(vehicle.id);
      const motion = await this.motionOf(vehicle, rental, task);
      const projected = projectTelemetry(stored, motion, { vehicleId: vehicle.id, fuel: vehicle.fuel }, now);

      result.set(vehicle.id, {
        ...projected,
        vehicleId: vehicle.id,
        state: stateOf(vehicle, Boolean(rental), Boolean(task)),
      });

      // 움직인 차만, 그것도 저장값이 묵었을 때만 되쓴다
      if (
        motion.kind !== 'IDLE' &&
        now.getTime() - stored.updatedAt.getTime() >= WRITE_THROUGH_MS
      ) {
        writeBack.push({ vehicleId: vehicle.id, snapshot: projected });
      }
    }

    await Promise.all(
      writeBack.map(({ vehicleId, snapshot }) =>
        this.prisma.vehicleTelemetry.update({
          where: { vehicleId },
          data: {
            fuelPct: snapshot.fuelPct,
            odometerKm: snapshot.odometerKm,
            lat: snapshot.lat,
            lng: snapshot.lng,
            updatedAt: snapshot.updatedAt,
          },
        }),
      ),
    );

    return result;
  }

  /**
   * 스냅샷 확정 — 반납·작업 완료처럼 "여기서 끝났다"가 정해진 순간에 부른다.
   * 이 시점 이후로 계산은 이 값에서 다시 시작한다.
   *
   * 진행 상태를 DB에서 다시 보지 않는다. 확정은 언제나 "이동이 끝난 직후"에 불리고
   * 그때는 이미 예약이 COMPLETED, 작업이 DONE으로 바뀌어 있어서 DB만 봐서는
   * "방금까지 달리고 있었다"를 알 수 없다 — 그래서 호출자가 `drivenSince`로 알려 준다.
   * 저장값이 이미 그 뒤로 갱신돼 있으면(운행 중 write-through) 그 지점부터만 더한다.
   */
  async freeze(
    db: TelemetryDb,
    vehicleId: string,
    opts: { at?: Date; position?: Coord; state?: SmartKeyState; drivenSince?: Date | null } = {},
  ): Promise<VehicleTelemetry> {
    const at = opts.at ?? new Date();
    const stored = await this.ensure(db, vehicleId);
    const vehicle = await db.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { fuel: true },
    });

    const since =
      opts.drivenSince && opts.drivenSince > stored.updatedAt ? opts.drivenSince : stored.updatedAt;
    const base: TelemetrySnapshot = { ...stored, updatedAt: since };
    const destination = opts.position ?? { lat: stored.lat, lng: stored.lng };
    const motion: VehicleMotion = opts.drivenSince
      ? {
          kind: 'DRIVING',
          from: { lat: stored.lat, lng: stored.lng },
          to: destination,
          startedAt: since,
          durationMs: Math.max(at.getTime() - since.getTime(), 1),
        }
      : { kind: 'IDLE' };
    const projected = projectTelemetry(base, motion, { vehicleId, fuel: vehicle.fuel }, at);

    return db.vehicleTelemetry.update({
      where: { vehicleId },
      data: {
        fuelPct: projected.fuelPct,
        odometerKm: projected.odometerKm,
        lat: destination.lat,
        lng: destination.lng,
        ...(opts.state ?? {}),
        updatedAt: at,
      },
    });
  }

  /**
   * 이 차가 지금 무엇을 하고 있는지 → 계산 입력.
   *
   * 탁송(EN_ROUTE)이 대여보다 우선한다: 탁송 중인 차에 진행 중 대여가 걸려 있을 수 없고,
   * 걸려 있다면 그건 데이터가 잘못된 것이라 눈에 띄는 쪽(움직이는 작업)을 따르는 게 낫다.
   */
  private async motionOf(
    vehicle: VehicleRow,
    rental: RentalRow | undefined,
    task: HandlerTaskRow | undefined,
  ): Promise<VehicleMotion> {
    if (task?.startedAt) {
      const from = fromPlace(task);
      const to = toPlace(task);
      // 페이스는 A* 추정 시간에 맞춘다 — 경로가 멀수록 오래 걸린다
      const eta = await this.travel.estimateDrive(from, to, taskRegion(task));
      return {
        kind: 'TRANSIT',
        from,
        to,
        startedAt: task.startedAt,
        durationMs: Math.max(eta.seconds, 60) * 1000,
      };
    }

    if (rental) {
      const resv = rental.reservation;
      const from: Coord =
        resv.deliveryLat !== null && resv.deliveryLng !== null
          ? { lat: resv.deliveryLat, lng: resv.deliveryLng } // 부름은 수령지에서 출발한다
          : vehicle.zone;
      const durationMs = Math.max(resv.endAt.getTime() - rental.startedAt.getTime(), 60_000);
      // 편도면 반납 존까지, 왕복(부름 포함)이면 어딘가 갔다가 제자리로
      const oneway = resv.returnZone;
      return oneway
        ? { kind: 'DRIVING', from, to: oneway, startedAt: rental.startedAt, durationMs }
        : {
            kind: 'DRIVING',
            from,
            to: turnaroundPoint(from, vehicle.id, durationMs / 3600000),
            startedAt: rental.startedAt,
            durationMs,
            roundTrip: true,
          };
    }

    return { kind: 'IDLE' };
  }
}

type RentalRow = {
  startedAt: Date;
  reservation: {
    vehicleId: string;
    endAt: Date;
    deliveryLat: number | null;
    deliveryLng: number | null;
    returnZone: { lat: number; lng: number } | null;
  };
};

/** 저장값 — 행이 아직 없으면(방금 createMany로 만든 경우) 초기값을 그대로 쓴다 */
function toSnapshot(vehicle: VehicleRow, now: Date): TelemetrySnapshot {
  if (vehicle.telemetry) return vehicle.telemetry;
  return { ...initialTelemetry(vehicle.id, vehicle.zone), updatedAt: now };
}

/** 대기/운행/탁송/정비 판정 — 응답을 만드는 모든 곳이 이 한 줄을 본다 */
function stateOf(vehicle: VehicleRow, inUse: boolean, inTransit: boolean): OpsVehicleState {
  if (vehicle.status === 'MAINTENANCE') return 'MAINTENANCE';
  if (inTransit) return 'IN_TRANSIT';
  if (inUse) return 'IN_USE';
  return 'IDLE';
}

/** API 응답 형태로 (문자열 시각) */
export function toTelemetryRes(t: TelemetrySnapshot): VehicleTelemetryRes {
  return {
    fuelPct: t.fuelPct,
    odometerKm: t.odometerKm,
    doorLocked: t.doorLocked,
    engineOn: t.engineOn,
    lat: t.lat,
    lng: t.lng,
    updatedAt: t.updatedAt.toISOString(),
  };
}
