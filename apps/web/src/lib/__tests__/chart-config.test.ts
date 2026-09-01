import { describe, expect, it } from 'vitest';
import type { TooltipItem } from 'chart.js';
import {
  AXIS_TITLE,
  buildChartConfig,
  CHART_COLORS,
  dayTickLabel,
  formatAxisTick,
  formatChartValue,
  isEmptySpec,
  seriesColor,
} from '@/lib/chart-config';

/** 옵션 깊은 곳을 꺼내는 헬퍼 — 설정 객체는 타입이 넓어 캐스팅이 필요하다 */
const scales = (config: ReturnType<typeof buildChartConfig>) =>
  config.options?.scales as Record<string, Record<string, unknown>>;

describe('차트 값 표기 — 툴팁은 정확히, 축은 축약해서', () => {
  it('툴팁은 원화를 축약하지 않는다', () => {
    expect(formatChartValue(1_234_000, 'krw')).toBe('1,234,000원');
    expect(formatChartValue(0, 'krw')).toBe('0원');
  });

  it('툴팁의 건수·퍼센트·시간에는 단위가 붙는다', () => {
    expect(formatChartValue(12, 'count')).toBe('12건');
    expect(formatChartValue(38.44, 'pct')).toBe('38.4%');
    expect(formatChartValue(7.25, 'hours')).toBe('7.3시간');
  });

  it('값이 없는 칸은 —로 남는다 (0과 구분)', () => {
    expect(formatChartValue(null, 'krw')).toBe('—');
    expect(formatChartValue(0, 'count')).toBe('0건');
  });

  it('축 눈금의 원화는 만·억으로 접힌다', () => {
    expect(formatAxisTick(9_000, 'krw')).toBe('9,000');
    expect(formatAxisTick(1_250_000, 'krw')).toBe('125만');
    expect(formatAxisTick(230_000_000, 'krw')).toBe('2.3억');
  });

  it('축 눈금의 건수는 단위 없이 숫자만 (단위는 축 제목이 말한다)', () => {
    expect(formatAxisTick(1200, 'count')).toBe('1,200');
    expect(AXIS_TITLE.count).toBe('건');
    expect(AXIS_TITLE.krw).toBe('원');
  });

  it('날짜 축은 연도를 반복하지 않는다', () => {
    expect(dayTickLabel('2030-01-05')).toBe('1/5');
    expect(dayTickLabel('2030-12-31')).toBe('12/31');
    // 날짜가 아닌 라벨(존 이름 등)은 그대로 흘려보낸다
    expect(dayTickLabel('강남 1호점')).toBe('강남 1호점');
  });
});

describe('색 팔레트', () => {
  it('계열 색은 팔레트를 순서대로 돌고 다시 처음으로 돌아온다', () => {
    expect(seriesColor(0)).toBe(CHART_COLORS[0]);
    expect(seriesColor(1)).toBe(CHART_COLORS[1]);
    expect(seriesColor(CHART_COLORS.length)).toBe(CHART_COLORS[0]);
  });

  it('인접한 계열은 서로 다른 색이다', () => {
    const used = new Set(CHART_COLORS);
    expect(used.size).toBe(CHART_COLORS.length);
  });
});

describe('빈 데이터 판정', () => {
  it('라벨이 없거나 값이 전부 null이면 빈 차트다', () => {
    expect(isEmptySpec({ labels: [], series: [{ label: '매출', data: [] }] })).toBe(true);
    expect(isEmptySpec({ labels: ['1/1'], series: [{ label: '매출', data: [null] }] })).toBe(true);
  });

  it('값이 0이어도 그릴 데이터는 있는 것이다', () => {
    expect(isEmptySpec({ labels: ['1/1'], series: [{ label: '매출', data: [0] }] })).toBe(false);
  });
});

describe('Chart.js 설정 빌더', () => {
  const spec = {
    kind: 'line' as const,
    labels: ['1/1', '1/2'],
    unit: 'krw' as const,
    series: [{ label: '매출', data: [120_000, 250_000] }],
  };

  it('라벨과 데이터를 그대로 싣고 반응형으로 둔다', () => {
    const config = buildChartConfig(spec);

    expect(config.type).toBe('line');
    expect(config.data.labels).toEqual(['1/1', '1/2']);
    expect(config.data.datasets[0]).toMatchObject({ label: '매출', data: [120_000, 250_000] });
    expect(config.options?.responsive).toBe(true);
    // 부모 높이를 채워야 해서 비율 유지는 끈다
    expect(config.options?.maintainAspectRatio).toBe(false);
  });

  it('계열이 하나면 범례를 감춘다 (제목의 반복이라)', () => {
    expect(buildChartConfig(spec).options?.plugins?.legend?.display).toBe(false);

    const two = buildChartConfig({
      ...spec,
      series: [...spec.series, { label: '비용', data: [1, 2] }],
    });
    expect(two.options?.plugins?.legend?.display).toBe(true);
    expect(two.data.datasets[1].borderColor).toBe(CHART_COLORS[1]);
  });

  it('y축 눈금 콜백이 원화를 만 단위로 찍고 축 제목에 단위를 적는다', () => {
    const y = scales(buildChartConfig(spec)).y;
    const tick = (y.ticks as { callback: (v: number) => string }).callback;

    expect(tick(1_250_000)).toBe('125만');
    expect((y.title as { text: string }).text).toBe('원');
    expect(y.beginAtZero).toBe(true);
  });

  it('툴팁은 계열 이름과 정확한 값을 붙여 준다', () => {
    const config = buildChartConfig(spec);
    const label = config.options?.plugins?.tooltip?.callbacks?.label as (
      item: TooltipItem<'line'>,
    ) => string;

    expect(label({ dataset: { label: '매출' }, parsed: { x: 0, y: 120_000 } } as TooltipItem<'line'>)).toBe(
      '매출 120,000원',
    );
  });

  it('가로 막대는 값 축이 x로 바뀌고 툴팁도 x를 읽는다', () => {
    const config = buildChartConfig({
      kind: 'bar',
      labels: ['한기사'],
      unit: 'count',
      horizontal: true,
      stacked: true,
      series: [{ label: '오늘 완료', data: [3] }],
    });

    expect(config.options?.indexAxis).toBe('y');
    expect(scales(config).x.stacked).toBe(true);
    expect(scales(config).y.stacked).toBe(true);
    expect((scales(config).x.title as { text: string }).text).toBe('건');

    const label = config.options?.plugins?.tooltip?.callbacks?.label as (
      item: TooltipItem<'bar'>,
    ) => string;
    expect(label({ dataset: { label: '오늘 완료' }, parsed: { x: 3, y: 0 } } as TooltipItem<'bar'>)).toBe(
      '오늘 완료 3건',
    );
  });

  it('막대는 모서리를 굴리고 선은 점 대신 곡선으로 잇는다 (계열 종류가 눈에 띄게)', () => {
    const bar = buildChartConfig({ ...spec, kind: 'bar' });
    expect(bar.data.datasets[0]).toMatchObject({ borderRadius: 3 });

    const line = buildChartConfig(spec);
    expect(line.data.datasets[0]).toMatchObject({ tension: 0.3, pointRadius: 0 });
  });
});
