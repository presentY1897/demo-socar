import { describe, expect, it } from 'vitest';
import { REPORT_RANGE_PRESETS } from '@socar/shared';
import {
  applyRangePreset,
  chartKindFor,
  defaultReportFilters,
  matchesPreset,
  readReportFilters,
  reportQueryString,
  withAllowedGroupBy,
  type ReportFilters,
} from '@/lib/ops-reports';

const TODAY = '2026-09-01';
const preset = (key: string) => REPORT_RANGE_PRESETS.find((p) => p.key === key)!;

describe('필터 ↔ URL 쿼리 — 링크를 복사하면 같은 리포트가 열려야 한다', () => {
  it('쓴 그대로 읽힌다 (왕복)', () => {
    const filters: ReportFilters = {
      metric: 'utilization',
      groupBy: 'model',
      from: '2026-08-01',
      to: '2026-08-31',
      zoneId: 'zone-gangnam',
      model: '아반떼',
    };

    const roundTrip = readReportFilters(new URLSearchParams(reportQueryString(filters)), TODAY);
    expect(roundTrip).toEqual(filters);
  });

  it('빈 필터는 URL에 남기지 않는다', () => {
    const query = reportQueryString(defaultReportFilters(TODAY));

    expect(query).toBe('metric=revenue&groupBy=day&from=2026-08-03&to=2026-09-01');
    expect(query).not.toContain('zoneId');
    expect(query).not.toContain('model');
  });

  it('기본값은 오늘까지 최근 30일 · 매출 × 일자', () => {
    expect(defaultReportFilters(TODAY)).toEqual({
      metric: 'revenue',
      groupBy: 'day',
      from: '2026-08-03',
      to: TODAY,
      zoneId: '',
      model: '',
    });
  });

  it('남이 준 링크에 이상한 값이 있어도 화면은 열린다 (기본값으로 흡수)', () => {
    const filters = readReportFilters(
      new URLSearchParams('metric=profit&groupBy=handler&from=&to='),
      TODAY,
    );

    expect(filters.metric).toBe('revenue');
    expect(filters.groupBy).toBe('day');
    expect(filters.from).toBe('2026-08-03');
  });

  it('URL의 조합이 허용되지 않으면 그 지표가 쓸 수 있는 축으로 옮긴다', () => {
    const filters = readReportFilters(
      new URLSearchParams('metric=zoneOccupancy&groupBy=day'),
      TODAY,
    );

    expect(filters).toMatchObject({ metric: 'zoneOccupancy', groupBy: 'zone' });
  });
});

describe('지표를 바꿀 때의 축 보정', () => {
  it('허용되는 축은 그대로 둔다', () => {
    const filters = { ...defaultReportFilters(TODAY), metric: 'lateReturnRate' as const, groupBy: 'model' as const };
    expect(withAllowedGroupBy(filters).groupBy).toBe('model');
  });

  it('존 점유율로 바꾸면 존별로 끌려온다 (400 대신)', () => {
    const filters = { ...defaultReportFilters(TODAY), metric: 'zoneOccupancy' as const };
    expect(withAllowedGroupBy(filters).groupBy).toBe('zone');
  });

  it('작업 처리량은 차종 축을 버린다', () => {
    const filters = {
      ...defaultReportFilters(TODAY),
      metric: 'taskThroughput' as const,
      groupBy: 'model' as const,
    };
    expect(withAllowedGroupBy(filters).groupBy).toBe('day');
  });
});

describe('기간 프리셋', () => {
  const base = defaultReportFilters(TODAY);

  it('최근 7일은 오늘을 포함한 7일이다', () => {
    const applied = applyRangePreset(base, preset('last7'), TODAY);
    expect(applied).toMatchObject({ from: '2026-08-26', to: TODAY });
  });

  it('이번 달은 1일부터 오늘까지', () => {
    const applied = applyRangePreset(base, preset('thisMonth'), TODAY);
    expect(applied).toMatchObject({ from: '2026-09-01', to: TODAY });
  });

  it('지금 걸린 기간과 같은 프리셋만 눌린 상태가 된다', () => {
    expect(matchesPreset(base, preset('last30'), TODAY)).toBe(true);
    expect(matchesPreset(base, preset('last7'), TODAY)).toBe(false);
  });

  it('프리셋은 지표·필터를 건드리지 않는다', () => {
    const filters = { ...base, metric: 'utilization' as const, zoneId: 'zone-gangnam' };
    const applied = applyRangePreset(filters, preset('last7'), TODAY);
    expect(applied).toMatchObject({ metric: 'utilization', zoneId: 'zone-gangnam' });
  });
});

describe('차트 종류', () => {
  it('일자는 흐름이라 선, 존·차종은 비교라 막대', () => {
    expect(chartKindFor('day')).toBe('line');
    expect(chartKindFor('zone')).toBe('bar');
    expect(chartKindFor('model')).toBe('bar');
  });
});
