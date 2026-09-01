import { buildOpsAlerts, type AlertInput } from './alert-rules';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 24 * 3600_000);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const input = (over: Partial<AlertInput> = {}): AlertInput => ({
  lowFuel: [],
  insuranceExpiring: [],
  contractExpiring: [],
  lateReturns: [],
  ...over,
});

describe('경고 피드 판정 (buildOpsAlerts)', () => {
  it('연료 20% 미만만 경고로 올린다', () => {
    const alerts = buildOpsAlerts(
      input({
        lowFuel: [
          { vehicleId: 'v-low', label: '레이 12허1234', fuel: 'GASOLINE', fuelPct: 12.4 },
          { vehicleId: 'v-ok', label: '아반떼 34허5678', fuel: 'GASOLINE', fuelPct: 20 },
        ],
      }),
      NOW,
    );
    expect(alerts.map((a) => a.targetId)).toEqual(['v-low']);
    expect(alerts[0].kind).toBe('LOW_FUEL');
    expect(alerts[0].tab).toBe('fleet'); // 누르면 차량 탭으로 간다
    expect(alerts[0].title).toContain('연료 12%');
  });

  it('EV는 같은 값을 배터리라고 부른다', () => {
    const [alert] = buildOpsAlerts(
      input({ lowFuel: [{ vehicleId: 'v', label: 'EV6', fuel: 'EV', fuelPct: 9 }] }),
      NOW,
    );
    expect(alert.title).toContain('배터리');
    expect(alert.detail).toContain('충전');
  });

  it('보험 만기는 D-30 이내만 올리고, 이미 지난 것도 올린다', () => {
    const alerts = buildOpsAlerts(
      input({
        insuranceExpiring: [
          { vehicleId: 'v-soon', label: 'K5', insurerName: '모카손보', expiresAt: inDays(18) },
          { vehicleId: 'v-far', label: '쏘렌토', insurerName: '모카손보', expiresAt: inDays(90) },
          { vehicleId: 'v-past', label: '레이', insurerName: '모카손보', expiresAt: inDays(-3) },
        ],
      }),
      NOW,
    );
    expect(alerts.map((a) => a.targetId)).toEqual(['v-past', 'v-soon']); // 임박한 순
    expect(alerts[0].title).toContain('만기 3일 경과');
    expect(alerts[1].title).toContain('D-18');
    expect(alerts[1].dDay).toBe(18);
  });

  it('존 계약 만료는 존/계약 탭을 가리킨다', () => {
    const [alert] = buildOpsAlerts(
      input({
        contractExpiring: [
          { zoneId: 'z1', zoneName: '성수역 2번 출구', partnerName: '하이파킹', contractEnd: inDays(12) },
        ],
      }),
      NOW,
    );
    expect(alert.kind).toBe('CONTRACT_EXPIRING');
    expect(alert.tab).toBe('zones');
    expect(alert.targetId).toBe('z1');
    expect(alert.detail).toContain('하이파킹');
  });

  it('지연 반납은 심각(danger)이라 맨 위로 오고 고객 탭을 가리킨다', () => {
    const alerts = buildOpsAlerts(
      input({
        insuranceExpiring: [
          { vehicleId: 'v', label: 'K5', insurerName: '모카손보', expiresAt: inDays(1) },
        ],
        lateReturns: [
          { userId: 'u1', userName: '김소카', label: '레이 12허1234', endAt: minutesAgo(95) },
        ],
      }),
      NOW,
    );
    expect(alerts[0].kind).toBe('LATE_RETURN');
    expect(alerts[0].severity).toBe('danger');
    expect(alerts[0].tab).toBe('customers');
    expect(alerts[0].targetId).toBe('u1');
    expect(alerts[0].title).toContain('1시간 35분');
  });

  it('경고가 없으면 빈 목록 — 조용한 날은 조용해야 한다', () => {
    expect(buildOpsAlerts(input(), NOW)).toEqual([]);
  });

  it('id는 종류+대상으로 만들어져 목록 리렌더에서 안정적이다', () => {
    const [alert] = buildOpsAlerts(
      input({ lowFuel: [{ vehicleId: 'v9', label: '레이', fuel: 'GASOLINE', fuelPct: 5 }] }),
      NOW,
    );
    expect(alert.id).toBe('LOW_FUEL:v9');
  });
});
