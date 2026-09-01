import { z } from 'zod';

/**
 * 리포트 빌더(`GET /ops/reports`)의 지표 사전과 요청 DTO — API 검증과 화면 폼이 같은 표를 본다.
 *
 * 지표마다 "이 축으로 갈라도 말이 되는가"가 다르다. 존 점유율을 차종으로 가르면 답이 없고,
 * 작업 처리량을 차종으로 가르는 건 물어보는 사람이 없다. 그 판정을 API와 화면이 따로 적으면
 * 화면에 뜨는 조합이 400을 받는 일이 생기므로, **허용 조합을 여기 한 곳**에 둔다.
 */

// ─────────────────────────── 지표 · 축 ───────────────────────────

export const reportMetricSchema = z.enum([
  'revenue', // 매출 (이용 결제)
  'utilization', // 가동률
  'zoneOccupancy', // 존 점유율
  'taskThroughput', // 작업 처리량
  'lateReturnRate', // 지연 반납률
]);
export type ReportMetric = z.infer<typeof reportMetricSchema>;

export const reportGroupBySchema = z.enum(['day', 'zone', 'model']);
export type ReportGroupBy = z.infer<typeof reportGroupBySchema>;

export const REPORT_GROUP_BY_LABEL: Record<ReportGroupBy, string> = {
  day: '일자별',
  zone: '존별',
  model: '차종별',
};

/** 값의 단위 — 축·툴팁·CSV 헤더 표기가 여기서 갈린다 */
export const reportUnitSchema = z.enum(['krw', 'count', 'pct']);
export type ReportUnit = z.infer<typeof reportUnitSchema>;

export const REPORT_UNIT_LABEL: Record<ReportUnit, string> = {
  krw: '원',
  count: '건',
  pct: '%',
};

export interface ReportMetricMeta {
  label: string;
  unit: ReportUnit;
  /** 이 지표를 가를 수 있는 축 — 목록에 없는 조합은 400 */
  groupBys: ReportGroupBy[];
  /**
   * 기간(from~to)에 반응하는가.
   * 존 점유율은 "지금 어디에 몇 대가 서 있나"의 스냅샷이라 기간을 바꿔도 움직이지 않는다 —
   * 회계 탭의 월 고정비와 같은 종류의 비대칭이라 화면이 숨기지 말고 적어야 한다.
   */
  periodSensitive: boolean;
  /** 화면·문서가 함께 쓰는 한 줄 설명 (무엇을 세는 값인지) */
  hint: string;
}

export const REPORT_METRIC_META: Record<ReportMetric, ReportMetricMeta> = {
  revenue: {
    label: '매출',
    unit: 'krw',
    groupBys: ['day', 'zone', 'model'],
    periodSensitive: true,
    hint: '기간 안에 승인된 이용 결제 합계 (법인 리스 매출·월 고정비는 회계 탭 소관)',
  },
  utilization: {
    label: '가동률',
    unit: 'pct',
    groupBys: ['day', 'zone', 'model'],
    periodSensitive: true,
    hint: '예약이 차지한 시간 ÷ (차량 수 × 기간)',
  },
  zoneOccupancy: {
    label: '존 점유율',
    unit: 'pct',
    groupBys: ['zone'],
    periodSensitive: false,
    hint: '지금 존에 배정된 차량 수 ÷ 면수 — 기간과 무관한 현재 스냅샷',
  },
  taskThroughput: {
    label: '작업 처리량',
    unit: 'count',
    groupBys: ['day', 'zone'],
    periodSensitive: true,
    hint: '기간 안에 완료된 핸들러 작업 수 (출발 존 기준)',
  },
  lateReturnRate: {
    label: '지연 반납률',
    unit: 'pct',
    groupBys: ['day', 'zone', 'model'],
    periodSensitive: true,
    hint: '기간 안에 반납된 이용 중 지연 반납 비율',
  },
};

export const isReportGroupByAllowed = (metric: ReportMetric, groupBy: ReportGroupBy): boolean =>
  REPORT_METRIC_META[metric].groupBys.includes(groupBy);

/** 지표를 고르면 축 선택지가 바뀐다 — 화면 폼이 쓰는 목록 */
export const reportGroupBysFor = (metric: ReportMetric): ReportGroupBy[] =>
  REPORT_METRIC_META[metric].groupBys;

// ─────────────────────────── 기간 ───────────────────────────

/** 기간은 KST 달력 날짜(YYYY-MM-DD)로 받는다 — 시각까지 받으면 "8월 1일 매출"이 사람마다 달라진다 */
export const reportDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '기간은 YYYY-MM-DD 형식이어야 합니다');

/** 기간 상한 — 하루씩 가르면 눈금이 366개가 넘는 리포트는 읽을 수 없다 */
export const REPORT_MAX_RANGE_DAYS = 366;
/** 기간 기본값 — 최근 30일 */
export const REPORT_DEFAULT_RANGE_DAYS = 30;

/** 화면의 기간 프리셋 — 버튼 라벨과 일수를 화면이 다시 적지 않게 */
export const REPORT_RANGE_PRESETS = [
  { key: 'last7', label: '최근 7일', days: 7 },
  { key: 'last30', label: '최근 30일', days: 30 },
  { key: 'thisMonth', label: '이번 달', days: null },
] as const;
export type ReportRangePresetKey = (typeof REPORT_RANGE_PRESETS)[number]['key'];

// ─────────────────────────── 요청 DTO ───────────────────────────

/**
 * 빈 문자열은 "지정 안 함"으로 본다.
 * 화면의 셀렉트에서 "전체"를 고르면 `?zoneId=`로 나가는데, 이걸 거절하면 필터를 푸는 조작이
 * 400이 된다 — 값을 비우는 것과 파라미터를 안 보내는 것은 같은 뜻이어야 한다.
 */
const blankAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/** `GET /ops/reports?metric&groupBy&from&to&zoneId&model` */
export const reportQuerySchema = z
  .object({
    metric: reportMetricSchema,
    groupBy: reportGroupBySchema,
    from: blankAsUndefined(reportDateSchema),
    to: blankAsUndefined(reportDateSchema),
    zoneId: blankAsUndefined(z.string().min(1)),
    model: blankAsUndefined(z.string().min(1)),
  })
  .superRefine((v, ctx) => {
    if (!isReportGroupByAllowed(v.metric, v.groupBy)) {
      const allowed = reportGroupBysFor(v.metric)
        .map((g) => REPORT_GROUP_BY_LABEL[g])
        .join(' · ');
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['groupBy'],
        message: `${REPORT_METRIC_META[v.metric].label}은(는) ${allowed}로만 가를 수 있어요`,
      });
    }
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: '종료일은 시작일 이후여야 합니다',
      });
    }
    if (v.from && v.to && rangeDays(v.from, v.to) > REPORT_MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: `기간은 최대 ${REPORT_MAX_RANGE_DAYS}일까지 조회할 수 있어요`,
      });
    }
  });
export type ReportQueryDto = z.infer<typeof reportQuerySchema>;

/** 두 날짜(YYYY-MM-DD) 사이의 일수 — 양끝 포함 */
export function rangeDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.floor(ms / (24 * 3600 * 1000)) + 1;
}

/** `YYYY-MM-DD` 하루 더하기 — 기간 계산을 화면·서버가 같은 함수로 한다 */
export function shiftDate(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
