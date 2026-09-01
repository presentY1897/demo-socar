import { describe, expect, it } from 'vitest';
import {
  isReportGroupByAllowed,
  rangeDays,
  REPORT_METRIC_META,
  reportGroupBysFor,
  reportMetricSchema,
  reportQuerySchema,
  shiftDate,
} from './report';

/** 첫 번째 이슈의 메시지 — 왜 막혔는지 화면이 그대로 보여 준다 */
const firstIssue = (query: unknown) => {
  const parsed = reportQuerySchema.safeParse(query);
  expect(parsed.success).toBe(false);
  return parsed.success ? '' : parsed.error.issues[0].message;
};

describe('지표 사전', () => {
  it('지표 5종이 각각 최소 한 축을 가지고, 축은 전부 알려진 값이다', () => {
    expect(Object.keys(REPORT_METRIC_META)).toEqual(reportMetricSchema.options);
    for (const meta of Object.values(REPORT_METRIC_META)) {
      expect(meta.groupBys.length).toBeGreaterThan(0);
      expect(meta.label).not.toBe('');
    }
  });

  it('존 점유율은 존별로만 가를 수 있다 (일자·차종은 뜻이 없다)', () => {
    expect(reportGroupBysFor('zoneOccupancy')).toEqual(['zone']);
    expect(isReportGroupByAllowed('zoneOccupancy', 'day')).toBe(false);
    expect(isReportGroupByAllowed('zoneOccupancy', 'zone')).toBe(true);
  });

  it('작업 처리량은 차종으로 가르지 않는다', () => {
    expect(isReportGroupByAllowed('taskThroughput', 'model')).toBe(false);
    expect(isReportGroupByAllowed('taskThroughput', 'day')).toBe(true);
  });

  it('기간에 반응하지 않는 지표는 존 점유율 하나뿐이다 — 화면이 이걸 보고 표기한다', () => {
    const timeless = Object.entries(REPORT_METRIC_META)
      .filter(([, meta]) => !meta.periodSensitive)
      .map(([metric]) => metric);
    expect(timeless).toEqual(['zoneOccupancy']);
  });
});

describe('요청 검증', () => {
  const base = { metric: 'revenue', groupBy: 'day' };

  it('허용 조합은 통과하고 기간은 선택이다', () => {
    expect(reportQuerySchema.safeParse(base).success).toBe(true);
    expect(reportQuerySchema.safeParse({ ...base, from: '2026-08-01', to: '2026-08-31' }).success).toBe(
      true,
    );
  });

  it('미허용 조합은 허용 축을 알려 준다', () => {
    expect(firstIssue({ metric: 'zoneOccupancy', groupBy: 'day' })).toContain('존별');
  });

  it('빈 문자열은 "지정 안 함"으로 본다 — 셀렉트에서 전체를 고르는 조작이 400이 되면 안 된다', () => {
    const parsed = reportQuerySchema.parse({ ...base, zoneId: '', model: '', from: '', to: '' });
    expect(parsed).toEqual({
      metric: 'revenue',
      groupBy: 'day',
      zoneId: undefined,
      model: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it('날짜 형식·순서·상한을 지킨다', () => {
    expect(firstIssue({ ...base, from: '2026/08/01' })).toContain('YYYY-MM-DD');
    expect(firstIssue({ ...base, from: '2026-08-31', to: '2026-08-01' })).toContain('이후');
    expect(firstIssue({ ...base, from: '2020-01-01', to: '2026-01-01' })).toContain('366일');
  });

  it('같은 날 하루짜리 기간은 허용한다', () => {
    expect(reportQuerySchema.safeParse({ ...base, from: '2026-08-01', to: '2026-08-01' }).success).toBe(
      true,
    );
  });
});

describe('날짜 계산 — 화면과 서버가 같은 함수를 쓴다', () => {
  it('기간 일수는 양끝을 포함한다', () => {
    expect(rangeDays('2026-08-01', '2026-08-01')).toBe(1);
    expect(rangeDays('2026-08-01', '2026-08-07')).toBe(7);
  });

  it('달·해를 넘어도 하루씩 정확히 움직인다', () => {
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDate('2026-03-01', -29)).toBe('2026-01-31');
  });

  it('최근 30일 프리셋은 오늘을 포함해 30일이다', () => {
    const to = '2026-09-01';
    const from = shiftDate(to, -29);
    expect(from).toBe('2026-08-03');
    expect(rangeDays(from, to)).toBe(30);
  });
});
