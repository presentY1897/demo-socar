import { OPS_VEHICLE_STATE_META, type OpsFleetVehicleRes } from '@socar/shared';

/**
 * Fleet 표의 정렬 — 화면과 분리된 순수 함수.
 *
 * 정렬 키마다 "값이 없는 행"이 있다(다음 예약이 없는 차, 보험 정보가 없는 차).
 * 이런 행을 방향에 따라 맨 위로 올리면 "보험 만기가 급한 순"을 보려다 정보가 없는 차부터
 * 보게 된다 — 그래서 **빈 값은 방향과 무관하게 항상 뒤로** 보낸다.
 */
export type FleetSortKey =
  | 'plateNo'
  | 'state'
  | 'zone'
  | 'fuelPct'
  | 'odometerKm'
  | 'nextReservation'
  | 'insuranceDDay';

export type SortDir = 'asc' | 'desc';

export const FLEET_SORT_LABEL: Record<FleetSortKey, string> = {
  plateNo: '차량 번호',
  state: '상태',
  zone: '배정 존',
  fuelPct: '연료·배터리',
  odometerKm: '주행거리',
  nextReservation: '다음 예약',
  insuranceDDay: '보험 만기',
};

/** 상태 정렬은 사전순이 아니라 shared에 선언된 순서(대기→운행→탁송→정비)를 따른다 */
const STATE_ORDER = Object.keys(OPS_VEHICLE_STATE_META);

type Cell = { text: string } | { num: number } | null;

function cell(v: OpsFleetVehicleRes, key: FleetSortKey): Cell {
  switch (key) {
    case 'plateNo':
      return { text: v.plateNo };
    case 'state':
      return { num: STATE_ORDER.indexOf(v.state) };
    case 'zone':
      return { text: v.zone.name };
    case 'fuelPct':
      return { num: v.telemetry.fuelPct };
    case 'odometerKm':
      return { num: v.telemetry.odometerKm };
    case 'nextReservation':
      return v.nextReservation ? { num: new Date(v.nextReservation.startAt).getTime() } : null;
    case 'insuranceDDay':
      return v.insurance ? { num: v.insurance.dDay } : null;
  }
}

export function sortFleet(
  rows: readonly OpsFleetVehicleRes[],
  key: FleetSortKey,
  dir: SortDir,
): OpsFleetVehicleRes[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = cell(a, key);
    const y = cell(b, key);
    if (x === null && y === null) return a.plateNo.localeCompare(b.plateNo, 'ko');
    if (x === null) return 1; // 빈 값은 방향과 무관하게 뒤로
    if (y === null) return -1;
    const diff =
      'num' in x && 'num' in y ? x.num - y.num : String('text' in x ? x.text : '').localeCompare(
        String('text' in y ? y.text : ''),
        'ko',
      );
    // 같은 값이면 차량 번호로 안정화 — 리렌더마다 행 순서가 흔들리지 않게
    return diff !== 0 ? diff * sign : a.plateNo.localeCompare(b.plateNo, 'ko');
  });
}
