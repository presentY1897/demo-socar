import {
  FUEL_DRAIN_PCT_PER_100KM,
  MIN_FUEL_PCT,
  MOCK_SPEED_MAX_KMH,
  MOCK_SPEED_MIN_KMH,
  mockDrivenKm,
  mockSpeedKmh,
  positionAt,
  projectTelemetry,
  turnaroundPoint,
  type TelemetrySnapshot,
  type VehicleMotion,
} from './telemetry-mock';

const START = new Date('2026-09-01T00:00:00.000Z');
const hoursLater = (h: number) => new Date(START.getTime() + h * 3600_000);

const ORIGIN = { lat: 37.544579, lng: 127.055961 }; // 성수역
const DEST = { lat: 37.497175, lng: 127.02758 }; // 강남역

const stored = (over: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot => ({
  fuelPct: 80,
  odometerKm: 10000,
  doorLocked: false,
  engineOn: true,
  ...ORIGIN,
  updatedAt: START,
  ...over,
});

type MovingMotion = Exclude<VehicleMotion, { kind: 'IDLE' }>;

const driving = (over: Partial<MovingMotion> = {}): MovingMotion => ({
  kind: 'DRIVING',
  from: ORIGIN,
  to: DEST,
  startedAt: START,
  durationMs: 4 * 3600_000,
  ...over,
});

describe('텔레메트리 모의 엔진 — 속도·거리', () => {
  it('속도는 차량마다 고정이고 15~35km/h 안에 있다', () => {
    for (const id of ['veh-a', 'veh-b', 'veh-c', 'veh-d']) {
      const v = mockSpeedKmh(id);
      expect(v).toBeGreaterThanOrEqual(MOCK_SPEED_MIN_KMH);
      expect(v).toBeLessThan(MOCK_SPEED_MAX_KMH);
      expect(mockSpeedKmh(id)).toBe(v);
    }
  });

  it('주행거리는 경과 시간 × 그 차의 속도다', () => {
    const km = mockDrivenKm('veh-a', START, hoursLater(2));
    expect(km).toBeCloseTo(Math.round(2 * mockSpeedKmh('veh-a') * 10) / 10, 5);
  });

  it('반납 정산은 하한 시간을 둬서 0km가 되지 않는다', () => {
    expect(mockDrivenKm('veh-a', START, START)).toBe(0);
    expect(mockDrivenKm('veh-a', START, START, 0.05)).toBeGreaterThan(0);
  });

  it('나눠 계산해도 총 주행거리가 같다 — write-through가 값을 바꾸지 않는다', () => {
    const whole = projectTelemetry(stored(), driving(), { vehicleId: 'veh-a', fuel: 'GASOLINE' }, hoursLater(2));
    const half = projectTelemetry(stored(), driving(), { vehicleId: 'veh-a', fuel: 'GASOLINE' }, hoursLater(1));
    const rest = projectTelemetry(half, driving(), { vehicleId: 'veh-a', fuel: 'GASOLINE' }, hoursLater(2));
    expect(rest.odometerKm).toBeCloseTo(whole.odometerKm, 0);
    expect(rest.fuelPct).toBeCloseTo(whole.fuelPct, 0);
    expect(rest.lat).toBeCloseTo(whole.lat, 6);
  });
});

describe('텔레메트리 모의 엔진 — 경과 시간별 값', () => {
  const vehicle = { vehicleId: 'veh-a', fuel: 'GASOLINE' as const };

  it('운행 중이면 주행거리가 늘고 연료가 준다', () => {
    const after = projectTelemetry(stored(), driving(), vehicle, hoursLater(2));
    const km = mockDrivenKm('veh-a', START, hoursLater(2));

    expect(after.odometerKm).toBeCloseTo(10000 + km, 1);
    expect(after.fuelPct).toBeCloseTo(80 - (km / 100) * FUEL_DRAIN_PCT_PER_100KM.GASOLINE, 1);
    expect(after.updatedAt).toEqual(hoursLater(2));
  });

  it('오래 달려도 연료는 하한 아래로 내려가지 않는다', () => {
    const after = projectTelemetry(stored({ fuelPct: 8 }), driving({ durationMs: 400 * 3600_000 }), vehicle, hoursLater(300));
    expect(after.fuelPct).toBe(MIN_FUEL_PCT);
  });

  it('EV와 내연은 같은 거리에서 감소율이 다르다', () => {
    const ev = projectTelemetry(stored(), driving(), { vehicleId: 'veh-a', fuel: 'EV' }, hoursLater(3));
    const gas = projectTelemetry(stored(), driving(), { vehicleId: 'veh-a', fuel: 'GASOLINE' }, hoursLater(3));
    const hybrid = projectTelemetry(stored(), driving(), { vehicleId: 'veh-a', fuel: 'HYBRID' }, hoursLater(3));

    // 주행거리는 같고 연료만 갈린다 — 감소율만의 차이라는 걸 못 박는다
    expect(ev.odometerKm).toBe(gas.odometerKm);
    expect(ev.fuelPct).toBeLessThan(gas.fuelPct);
    expect(gas.fuelPct).toBeLessThan(hybrid.fuelPct);
  });

  it('대기 중이면 아무것도 변하지 않는다 (문 잠금·시동은 스마트키 값 유지)', () => {
    const parked = stored({ doorLocked: true, engineOn: false });
    expect(projectTelemetry(parked, { kind: 'IDLE' }, vehicle, hoursLater(12))).toEqual(parked);
  });

  it('시간을 거슬러 조회해도 값이 뒤로 가지 않는다', () => {
    const before = stored();
    expect(projectTelemetry(before, driving(), vehicle, hoursLater(-1))).toEqual(before);
  });

  it('스마트키가 만든 문 잠금·시동은 모의 엔진이 건드리지 않는다', () => {
    const after = projectTelemetry(stored({ doorLocked: false, engineOn: true }), driving(), vehicle, hoursLater(1));
    expect(after.doorLocked).toBe(false);
    expect(after.engineOn).toBe(true);
  });
});

describe('텔레메트리 모의 엔진 — 위치 보간', () => {
  it('편도는 출발지 → 도착지로 곧장 간다', () => {
    const m = driving();
    expect(positionAt(m, START)).toEqual(ORIGIN);
    const half = positionAt(m, hoursLater(2));
    expect(half.lat).toBeCloseTo((ORIGIN.lat + DEST.lat) / 2, 6);
    // 예정 시간이 지나면 도착지에서 멈춘다 — 반납 시점 스냅샷이 목적지 값으로 확정된다
    expect(positionAt(m, hoursLater(9))).toEqual(DEST);
  });

  it('왕복은 반환점까지 갔다가 원래 자리로 돌아온다', () => {
    const turn = turnaroundPoint(ORIGIN, 'veh-a', 4);
    const m = driving({ to: turn, roundTrip: true });

    expect(positionAt(m, hoursLater(2)).lat).toBeCloseTo(turn.lat, 6); // 절반 = 반환점
    const back = positionAt(m, hoursLater(4));
    expect(back.lat).toBeCloseTo(ORIGIN.lat, 6);
    expect(back.lng).toBeCloseTo(ORIGIN.lng, 6);
    // 나가는 길과 돌아오는 길의 같은 지점 — 왕복이라는 걸 위치로 확인
    expect(positionAt(m, hoursLater(1)).lat).toBeCloseTo(positionAt(m, hoursLater(3)).lat, 6);
  });

  it('반환점은 차량마다 다른 방향으로 잡히고 늘 같다', () => {
    const a = turnaroundPoint(ORIGIN, 'veh-a', 4);
    const b = turnaroundPoint(ORIGIN, 'veh-b', 4);
    expect(a).not.toEqual(b);
    expect(turnaroundPoint(ORIGIN, 'veh-a', 4)).toEqual(a);
  });

  it('탁송은 A* 추정 시간으로 페이스를 맞춘다', () => {
    const m: MovingMotion = {
      kind: 'TRANSIT',
      from: ORIGIN,
      to: DEST,
      startedAt: START,
      durationMs: 30 * 60_000, // ETA 30분
    };
    const quarter = positionAt(m, new Date(START.getTime() + 15 * 60_000));
    expect(quarter.lat).toBeCloseTo((ORIGIN.lat + DEST.lat) / 2, 6);
    expect(positionAt(m, new Date(START.getTime() + 60 * 60_000))).toEqual(DEST); // ETA 지나면 도착
  });
});
