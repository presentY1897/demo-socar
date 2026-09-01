import type { ChartConfiguration, ChartDataset, TooltipItem } from 'chart.js';
import { krw } from './format';

/**
 * Chart.js 설정을 만드는 **순수 함수** — 캔버스도 React도 모른다 (M4-1).
 *
 * 화면(`ChartCanvas`)은 마운트/파기만 하고 "무엇을 어떻게 그리는가"는 전부 여기 있다.
 * 축 눈금과 툴팁의 한국어 표기가 차트마다 갈리면 같은 값이 화면마다 다르게 읽히므로,
 * 단위(원/건/%/시간)별 표기 규칙을 한 곳에 모은다.
 */

// ─────────────────────────── 색 ───────────────────────────

/**
 * 계열 색 — 앞의 둘이 브랜드 계열(하늘/인디고)이고 뒤로 갈수록 색상환에서 멀어진다.
 * 인접한 두 계열이 비슷한 색으로 붙지 않도록 순서 자체를 팔레트로 고정한다.
 */
export const CHART_COLORS = [
  '#0ea5e9', // sky-500 — 브랜드(--brand)와 같은 계열
  '#6366f1', // indigo-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#8b5cf6', // violet-500
] as const;

/** 눈금·격자 — 데이터보다 앞에 나오면 안 되는 것들이라 회색 계열로만 (gray-400/gray-200) */
const TICK_COLOR = '#9ca3af';
const GRID_COLOR = '#f1f5f9';

export const seriesColor = (index: number): string => CHART_COLORS[index % CHART_COLORS.length];

// ─────────────────────────── 단위 표기 ───────────────────────────

/** 값의 단위 — 축·툴팁 표기가 여기서 갈린다 */
export type ChartUnit = 'krw' | 'count' | 'pct' | 'hours';

/** 툴팁에 쓰는 **정확한 값** — 축약하지 않는다 (숫자를 확인하러 여는 곳이라) */
export function formatChartValue(value: number | null, unit: ChartUnit = 'count'): string {
  if (value === null || Number.isNaN(value)) return '—';
  switch (unit) {
    case 'krw':
      return krw(value);
    case 'pct':
      return `${round1(value)}%`;
    case 'hours':
      return `${round1(value)}시간`;
    case 'count':
      return `${value.toLocaleString('ko-KR')}건`;
  }
}

/**
 * 축 눈금 — 폭이 좁아 **축약**한다. 원화는 만/억 단위로 접는다.
 * (`1,250,000원`이 세로축에 다섯 개 쌓이면 그래프가 아니라 표가 된다)
 */
export function formatAxisTick(value: number, unit: ChartUnit = 'count'): string {
  switch (unit) {
    case 'krw':
      if (Math.abs(value) >= 100_000_000) return `${round1(value / 100_000_000)}억`;
      if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만`;
      return value.toLocaleString('ko-KR');
    case 'pct':
      return `${round1(value)}%`;
    default:
      return value.toLocaleString('ko-KR');
  }
}

/** 단위를 축 제목에 적어 둔다 — 축약된 눈금(만/억)만 보고 단위를 짐작하지 않게 */
export const AXIS_TITLE: Record<ChartUnit, string> = {
  krw: '원',
  count: '건',
  pct: '%',
  hours: '시간',
};

/** `2030-01-05` → `1/5` — 날짜 축은 연도를 반복하지 않는다 */
export function dayTickLabel(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[2])}/${Number(m[3])}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ─────────────────────────── 설정 빌더 ───────────────────────────

export type ChartKind = 'bar' | 'line';

export interface ChartSeries {
  /** 범례·툴팁에 그대로 나가는 이름 */
  label: string;
  data: (number | null)[];
  /** 팔레트 순서를 벗어나 색을 고정하고 싶을 때 */
  color?: string;
}

export interface ChartSpec {
  kind: ChartKind;
  /** x축 눈금 (이미 사람이 읽는 문자열이어야 한다 — 변환은 화면에서 끝낸다) */
  labels: string[];
  series: ChartSeries[];
  /**
   * 전 계열이 공유하는 값의 단위. 단위가 다른 값을 한 차트에 겹치면
   * 어느 축을 읽어야 하는지 알 수 없다 — 그럴 땐 차트를 둘로 나눈다.
   */
  unit?: ChartUnit;
  /** 범주 이름이 길 때(존·차종) 가로 막대로 눕힌다 */
  horizontal?: boolean;
  /** 여러 계열을 한 막대에 쌓는다 (완료/진행 중처럼 합이 의미 있는 경우) */
  stacked?: boolean;
}

/** 그릴 값이 하나도 없는가 — 화면이 "데이터 없음"을 띄울 근거 */
export const isEmptySpec = (spec: Pick<ChartSpec, 'labels' | 'series'>): boolean =>
  spec.labels.length === 0 || spec.series.every((s) => s.data.every((v) => v === null));

export function buildChartConfig(spec: ChartSpec): ChartConfiguration<ChartKind> {
  const unit = spec.unit ?? 'count';
  const datasets = spec.series.map((s, i) => toDataset(spec, s, i));
  const valueAxis = spec.horizontal ? 'x' : 'y';
  const categoryAxis = spec.horizontal ? 'y' : 'x';

  return {
    type: spec.kind,
    data: { labels: spec.labels, datasets },
    options: {
      responsive: true,
      // 부모 높이에 맞춘다 — 컨테이너가 h-48 같은 고정 높이를 준다
      maintainAspectRatio: false,
      indexAxis: spec.horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        // 계열이 하나면 범례가 제목의 반복이 된다
        legend: {
          display: spec.series.length > 1,
          position: 'bottom',
          labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, color: TICK_COLOR },
        },
        tooltip: {
          callbacks: {
            label: (item: TooltipItem<ChartKind>) =>
              `${item.dataset.label ?? ''} ${formatChartValue(toNumber(item.parsed, spec.horizontal), unit)}`.trim(),
          },
        },
      },
      scales: {
        [categoryAxis]: {
          stacked: spec.stacked ?? false,
          grid: { display: false },
          ticks: { color: TICK_COLOR, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 8 },
        },
        [valueAxis]: {
          stacked: spec.stacked ?? false,
          beginAtZero: true,
          border: { display: false },
          grid: { color: GRID_COLOR },
          title: { display: true, text: AXIS_TITLE[unit], color: TICK_COLOR, font: { size: 10 } },
          ticks: {
            color: TICK_COLOR,
            font: { size: 10 },
            callback: (value: string | number) => formatAxisTick(Number(value), unit),
          },
        },
      },
    },
  };
}

function toDataset(spec: ChartSpec, series: ChartSeries, index: number): ChartDataset<ChartKind> {
  const color = series.color ?? seriesColor(index);
  const base = { label: series.label, data: series.data, borderColor: color };
  return spec.kind === 'bar'
    ? { ...base, backgroundColor: color, borderRadius: 3, borderWidth: 0, maxBarThickness: 28 }
    : {
        ...base,
        backgroundColor: color,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        // 점이 하나뿐인 기간(예: 하루)에는 선이 안 보여서 점을 살려 준다
        pointHitRadius: 8,
      };
}

/** 가로 막대는 값이 x, 세로 막대는 값이 y에 들어온다 */
const toNumber = (parsed: unknown, horizontal?: boolean): number | null => {
  if (typeof parsed === 'number') return parsed;
  const point = parsed as { x?: number; y?: number } | null;
  const value = horizontal ? point?.x : point?.y;
  return typeof value === 'number' ? value : null;
};
