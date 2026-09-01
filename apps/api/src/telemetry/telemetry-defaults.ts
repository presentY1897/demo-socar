import type { Coord } from '@socar/shared';

/**
 * 차량 텔레메트리의 초기값 (M3-1).
 *
 * 실차가 없으니 "그럴듯한 첫 값"을 만들어야 하는데, 매번 난수를 쓰면 같은 차량이 조회할 때마다
 * 다른 주행거리를 갖는다 — 화면을 보다가 값이 튀면 버그인지 모의인지 구분할 수 없다.
 * 그래서 차량 id에서 결정적으로 뽑는다: 같은 차량은 언제 어디서 계산해도 같은 초기값.
 * (마이그레이션의 백필도 같은 방식으로 hashtext를 쓴다)
 */

/** 문자열 → 32비트 양수 해시 (FNV-1a) */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** [min, max) 구간의 결정적 값 */
export function seededRange(seed: string, min: number, max: number): number {
  return min + (hashSeed(seed) % 100000) / 100000 * (max - min);
}

export interface InitialTelemetry {
  fuelPct: number;
  odometerKm: number;
  doorLocked: boolean;
  engineOn: boolean;
  lat: number;
  lng: number;
}

/**
 * 새 차량(또는 텔레메트리 행이 아직 없는 차량)의 센서 초기값.
 * 차는 배정된 존에 잠긴 채 시동이 꺼진 상태로 서 있다 — 다음 사람이 스마트키로 여는 게 정상 흐름.
 */
export function initialTelemetry(vehicleId: string, at: Coord): InitialTelemetry {
  return {
    fuelPct: Math.round(seededRange(`${vehicleId}:fuel`, 35, 95) * 10) / 10,
    odometerKm: Math.round(seededRange(`${vehicleId}:odo`, 1200, 61200) * 10) / 10,
    doorLocked: true,
    engineOn: false,
    lat: at.lat,
    lng: at.lng,
  };
}
