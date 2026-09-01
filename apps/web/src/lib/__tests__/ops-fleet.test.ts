import { describe, expect, it } from 'vitest';
import type { OpsFleetVehicleRes } from '@socar/shared';
import { opsFleetIdle, opsFleetLowFuel, opsFleetMaintenance } from '@/test/msw/fixtures';
import { sortFleet } from '@/lib/ops-fleet';

const rows: OpsFleetVehicleRes[] = [opsFleetIdle, opsFleetLowFuel, opsFleetMaintenance];
const plates = (list: OpsFleetVehicleRes[]) => list.map((v) => v.plateNo);

describe('sortFleet', () => {
  it('연료가 적은 차부터 볼 수 있다', () => {
    expect(sortFleet(rows, 'fuelPct', 'asc')[0].plateNo).toBe(opsFleetLowFuel.plateNo);
    expect(sortFleet(rows, 'fuelPct', 'desc')[0].plateNo).toBe(opsFleetIdle.plateNo);
  });

  it('상태는 사전순이 아니라 shared 선언 순서(대기→운행→탁송→정비)를 따른다', () => {
    expect(sortFleet(rows, 'state', 'asc').map((v) => v.state)).toEqual([
      'IDLE',
      'IN_USE',
      'MAINTENANCE',
    ]);
  });

  it('값이 없는 행은 방향과 무관하게 항상 뒤로 간다', () => {
    // 정비 차량만 다음 예약이 없다 — "예약이 임박한 순"을 보려는데 앞에 오면 방해가 된다
    expect(sortFleet(rows, 'nextReservation', 'asc').at(-1)!.plateNo).toBe(
      opsFleetMaintenance.plateNo,
    );
    expect(sortFleet(rows, 'nextReservation', 'desc').at(-1)!.plateNo).toBe(
      opsFleetMaintenance.plateNo,
    );
  });

  it('보험 만기가 급한 순 — 같은 D-day는 차량 번호로 안정적으로 갈린다', () => {
    const sorted = sortFleet(rows, 'insuranceDDay', 'asc');
    expect(sorted[0].plateNo).toBe(opsFleetLowFuel.plateNo); // D-18
    expect(plates(sorted.slice(1))).toEqual(
      plates([opsFleetIdle, opsFleetMaintenance]).sort((a, b) => a.localeCompare(b, 'ko')),
    );
  });

  it('원본 배열을 건드리지 않는다', () => {
    const before = plates(rows);
    sortFleet(rows, 'odometerKm', 'desc');
    expect(plates(rows)).toEqual(before);
  });
});
