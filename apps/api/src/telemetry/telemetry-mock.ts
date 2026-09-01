import type { Coord, FuelTypeValue } from '@socar/shared';
import { seededRange } from './telemetry-defaults';

/**
 * 텔레메트리 모의 엔진 — 순수 함수 (M3-2).
 *
 * 실차가 없으니 센서 값을 지어내야 하는데, 백그라운드 워커로 5초마다 전 차량을 갱신하는 건
 * 무료 티어에서 CPU만 태우는 짓이다(§6-Q4). 그래서 **조회 시점에 계산한다**:
 * 저장값(마지막 확정 시점)에서 지금까지 흐른 시간만큼 차를 굴린 결과를 돌려주고,
 * 일정 간격이 지났을 때만 그 값을 도로 저장한다(write-through, 서비스 쪽 책임).
 *
 * 난수를 쓰지 않는 게 핵심이다. 속도·방향을 차량 id에서 결정적으로 뽑기 때문에
 *   ① 같은 차를 두 번 조회해도 값이 뒤로 가지 않고
 *   ② 중간에 몇 번 저장했든 총 주행거리가 `이용 시간 × 속도`로 같으며
 *   ③ 테스트가 시각만 바꿔 넣으면 기대값을 그대로 계산할 수 있다.
 */

/** 모의 주행 속도 범위 — 기존 반납 모의(M1-3)와 같은 분포 */
export const MOCK_SPEED_MIN_KMH = 15;
export const MOCK_SPEED_MAX_KMH = 35;

/**
 * 100km당 연료(EV는 배터리) 감소율 %.
 * 내연 12%는 "600km 남짓 주행 가능"이라는 감각, EV는 같은 거리에서 더 크게 줄고(주행 가능
 * 거리가 짧다), 하이브리드는 덜 준다. 데모에서 게이지가 차종별로 달리 움직이는 게 목적이다.
 */
export const FUEL_DRAIN_PCT_PER_100KM: Record<FuelTypeValue, number> = {
  GASOLINE: 12,
  HYBRID: 9,
  EV: 18,
};

/**
 * 연료 하한 — 0%가 되면 차는 서 있어야 하는데 모의 엔진에는 주유/충전이 없다.
 * 하한을 두고 "운영이 채워 넣은 셈" 치는 편이 0%인 차가 계속 달리는 것보다 덜 이상하다.
 */
export const MIN_FUEL_PCT = 5;

/** 왕복 예약의 가상 반환점이 존에서 벗어나는 최대 거리 */
const MAX_TURNAROUND_KM = 40;

export interface TelemetrySnapshot {
  fuelPct: number;
  odometerKm: number;
  doorLocked: boolean;
  engineOn: boolean;
  lat: number;
  lng: number;
  updatedAt: Date;
}

/**
 * 차량이 지금 무엇을 하고 있는가 — 계산의 입력.
 *   IDLE     대기 중: 아무것도 변하지 않는다 (문 잠금·시동은 스마트키가 남긴 값 그대로)
 *   DRIVING  대여 중: 존(또는 수령지) → 반납 예정지 방향으로 보간
 *   TRANSIT  탁송 중: 작업 출발지 → 도착지, A* 추정 시간으로 페이스를 맞춘다
 */
export type VehicleMotion =
  | { kind: 'IDLE' }
  | {
      kind: 'DRIVING' | 'TRANSIT';
      from: Coord;
      to: Coord;
      startedAt: Date;
      /** 이 구간을 다 도는 데 걸리는 시간(ms) */
      durationMs: number;
      /** 왕복이면 `to`는 가상 반환점이고 후반부에 되돌아온다 */
      roundTrip?: boolean;
    };

export interface MockVehicle {
  vehicleId: string;
  fuel: FuelTypeValue;
}

/** 이 차량의 모의 평균 주행 속도(km/h) — 차량마다 고정 */
export function mockSpeedKmh(vehicleId: string): number {
  return seededRange(`${vehicleId}:speed`, MOCK_SPEED_MIN_KMH, MOCK_SPEED_MAX_KMH);
}

/**
 * 두 시각 사이에 이 차가 달린 것으로 치는 거리(km).
 * `minHours`는 반납 정산이 0km가 되지 않게 두는 하한 (M1-3이 쓰던 0.05h와 같은 값).
 */
export function mockDrivenKm(vehicleId: string, from: Date, to: Date, minHours = 0): number {
  const hours = Math.max((to.getTime() - from.getTime()) / 3600000, minHours);
  if (hours <= 0) return 0;
  return round1(hours * mockSpeedKmh(vehicleId));
}

/**
 * 왕복 예약의 가상 반환점 — 존에서 결정적인 방향으로 (예상 주행거리 ÷ 2)만큼 떨어진 곳.
 *
 * 왕복은 출발지와 도착지가 같아서 그대로 보간하면 차가 존에 붙박이로 서 있게 된다.
 * "어딘가 갔다가 돌아온다"를 모의하려면 중간 목표가 하나 필요하다.
 */
export function turnaroundPoint(origin: Coord, vehicleId: string, tripHours: number): Coord {
  const bearing = (seededRange(`${vehicleId}:bearing`, 0, 360) * Math.PI) / 180;
  const km = Math.min((mockSpeedKmh(vehicleId) * tripHours) / 2, MAX_TURNAROUND_KM);
  const dLat = (km * Math.cos(bearing)) / 111;
  const dLng = (km * Math.sin(bearing)) / (111 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}

/**
 * 저장값 + 경과 시간 → 지금의 센서 값.
 *
 * 대기 중이면 저장값을 그대로 돌려준다 — 세워 둔 차의 주행거리가 늘어나면 그건 버그다.
 * 문 잠금·시동은 어떤 경우에도 건드리지 않는다: 그건 사람이 스마트키로 만든 상태다.
 */
export function projectTelemetry(
  stored: TelemetrySnapshot,
  motion: VehicleMotion,
  vehicle: MockVehicle,
  now: Date,
): TelemetrySnapshot {
  if (motion.kind === 'IDLE') return stored;

  const elapsedMs = now.getTime() - stored.updatedAt.getTime();
  if (elapsedMs <= 0) return stored;

  const drivenKm = mockDrivenKm(vehicle.vehicleId, stored.updatedAt, now);
  const drain = (drivenKm / 100) * FUEL_DRAIN_PCT_PER_100KM[vehicle.fuel];
  const position = positionAt(motion, now);

  return {
    ...stored,
    odometerKm: round1(stored.odometerKm + drivenKm),
    fuelPct: round1(clamp(stored.fuelPct - drain, MIN_FUEL_PCT, 100)),
    lat: position.lat,
    lng: position.lng,
    updatedAt: now,
  };
}

/**
 * 구간 위의 현재 위치.
 * 진행률은 절대 시각으로 계산한다(누적이 아니라) — 그래서 중간에 몇 번 저장하든 결과가 같다.
 */
export function positionAt(motion: Exclude<VehicleMotion, { kind: 'IDLE' }>, now: Date): Coord {
  const elapsed = now.getTime() - motion.startedAt.getTime();
  const p = clamp(motion.durationMs > 0 ? elapsed / motion.durationMs : 1, 0, 1);
  // 왕복은 전반부에 나갔다가 후반부에 되돌아온다
  const leg = motion.roundTrip ? (p <= 0.5 ? p * 2 : (1 - p) * 2) : p;
  return {
    lat: lerp(motion.from.lat, motion.to.lat, leg),
    lng: lerp(motion.from.lng, motion.to.lng, leg),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const round1 = (v: number) => Math.round(v * 10) / 10;
