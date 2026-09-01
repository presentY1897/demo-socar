import { hashSeed, initialTelemetry, seededRange } from './telemetry-defaults';

const ZONE = { lat: 37.544579, lng: 127.055961 };

describe('텔레메트리 초기값', () => {
  it('같은 차량은 언제 계산해도 같은 초기값을 갖는다', () => {
    expect(initialTelemetry('veh-1', ZONE)).toEqual(initialTelemetry('veh-1', ZONE));
  });

  it('차량이 다르면 값도 갈린다', () => {
    const a = initialTelemetry('veh-1', ZONE);
    const b = initialTelemetry('veh-2', ZONE);
    expect(a.odometerKm).not.toBe(b.odometerKm);
  });

  it('연료는 35~95%, 주행거리는 1,200km 이상 — 갓 출고된 차처럼 보이지 않게', () => {
    for (const id of ['a', 'bb', 'ccc', 'dddd', 'eeeee']) {
      const t = initialTelemetry(id, ZONE);
      expect(t.fuelPct).toBeGreaterThanOrEqual(35);
      expect(t.fuelPct).toBeLessThanOrEqual(95);
      expect(t.odometerKm).toBeGreaterThanOrEqual(1200);
    }
  });

  it('차는 배정 존에 잠긴 채 시동이 꺼져 있다', () => {
    expect(initialTelemetry('veh-1', ZONE)).toMatchObject({
      doorLocked: true,
      engineOn: false,
      ...ZONE,
    });
  });

  it('seededRange는 구간 안에 머문다', () => {
    for (let i = 0; i < 200; i++) {
      const v = seededRange(`k${i}`, 10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
  });
});
