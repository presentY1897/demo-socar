import {
  REPORT_METRIC_META,
  reportGroupBysFor,
  reportGroupBySchema,
  reportMetricSchema,
  shiftDate,
  type ReportGroupBy,
  type ReportMetric,
} from '@socar/shared';

/**
 * 리포트 화면의 필터 상태 ↔ URL 쿼리 변환 — 화면과 분리된 순수 함수 (M4-3).
 *
 * URL을 복사해 주면 같은 리포트가 열려야 한다. 그러려면 필터를 쿼리로 적는 규칙과
 * 쿼리에서 필터를 읽는 규칙이 정확히 역이어야 하는데, 화면 안에 흩어 두면
 * "쓸 때는 넣고 읽을 때는 빠뜨리는" 필드가 생긴다. Export(M4-4)도 같은 규칙으로
 * 다운로드 URL을 만든다.
 */

export interface ReportFilters {
  metric: ReportMetric;
  groupBy: ReportGroupBy;
  /** YYYY-MM-DD (KST 달력) */
  from: string;
  to: string;
  /** 빈 문자열 = 전체 */
  zoneId: string;
  model: string;
}

export const defaultReportFilters = (today: string): ReportFilters => ({
  metric: 'revenue',
  groupBy: 'day',
  from: shiftDate(today, -29),
  to: today,
  zoneId: '',
  model: '',
});

/** URL 쿼리 → 필터. 알 수 없는 값은 조용히 기본값으로 (남이 준 링크가 화면을 깨뜨리지 않게) */
export function readReportFilters(params: URLSearchParams, today: string): ReportFilters {
  const base = defaultReportFilters(today);
  const metric = reportMetricSchema.safeParse(params.get('metric'));
  const filters: ReportFilters = {
    ...base,
    metric: metric.success ? metric.data : base.metric,
    from: params.get('from') || base.from,
    to: params.get('to') || base.to,
    zoneId: params.get('zoneId') ?? '',
    model: params.get('model') ?? '',
  };

  const groupBy = reportGroupBySchema.safeParse(params.get('groupBy'));
  filters.groupBy = groupBy.success ? groupBy.data : reportGroupBysFor(filters.metric)[0];
  return withAllowedGroupBy(filters);
}

/**
 * 지표를 바꾸면 축이 못 따라올 수 있다 (존 점유율은 존별로만).
 * 그때 400을 받게 두지 않고 그 지표가 허용하는 첫 축으로 옮긴다 — 사용자가 고른 것은
 * 지표이지 "실패한 조합"이 아니다.
 */
export function withAllowedGroupBy(filters: ReportFilters): ReportFilters {
  const allowed = reportGroupBysFor(filters.metric);
  return allowed.includes(filters.groupBy) ? filters : { ...filters, groupBy: allowed[0] };
}

/** 필터 → 쿼리스트링. 빈 필터는 URL에 남기지 않는다 (링크가 짧고 읽힌다) */
export function reportQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams({
    metric: filters.metric,
    groupBy: filters.groupBy,
    from: filters.from,
    to: filters.to,
  });
  if (filters.zoneId) params.set('zoneId', filters.zoneId);
  if (filters.model) params.set('model', filters.model);
  return params.toString();
}

/** 기간 프리셋 적용 — "이번 달"은 1일부터 오늘까지 */
export function applyRangePreset(
  filters: ReportFilters,
  preset: { days: number | null },
  today: string,
): ReportFilters {
  if (preset.days === null) {
    return { ...filters, from: `${today.slice(0, 7)}-01`, to: today };
  }
  return { ...filters, from: shiftDate(today, -(preset.days - 1)), to: today };
}

/** 지금 걸린 기간이 이 프리셋과 같은가 — 버튼의 눌린 상태 */
export function matchesPreset(
  filters: ReportFilters,
  preset: { days: number | null },
  today: string,
): boolean {
  const applied = applyRangePreset(filters, preset, today);
  return applied.from === filters.from && applied.to === filters.to;
}

/** 차트 종류 — 일자는 흐름이라 선, 존·차종은 비교라 막대 */
export const chartKindFor = (groupBy: ReportGroupBy) => (groupBy === 'day' ? 'line' : 'bar');

export const metricLabel = (metric: ReportMetric) => REPORT_METRIC_META[metric].label;
