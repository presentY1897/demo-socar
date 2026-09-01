import { describe, expect, it, vi } from 'vitest';
import { ChartCanvas } from '@/components/charts/ChartCanvas';
import { chartInstances, lastChart, liveCharts } from '@/test/chart';
import { render, screen } from '@/test/utils';

// 캔버스 2D 컨텍스트가 없는 jsdom에서 실제 Chart는 뜨지 않는다 — 픽셀만 대역으로 (test/chart.ts)
vi.mock('@/components/charts/chart-lib', async () => (await import('@/test/chart')).chartLibMock());

const series = [{ label: '매출', data: [120_000, 250_000] }];

describe('ChartCanvas — 로딩/빈 데이터/데이터 3상태', () => {
  it('데이터가 있으면 캔버스를 걸고 설정을 그대로 넘긴다', () => {
    render(<ChartCanvas kind="line" unit="krw" labels={['1/1', '1/2']} series={series} />);

    expect(screen.getByRole('img', { name: '매출' })).toBeInTheDocument();
    expect(chartInstances()).toHaveLength(1);
    expect(lastChart().config.data.labels).toEqual(['1/1', '1/2']);
    expect(lastChart().config.data.datasets[0].data).toEqual([120_000, 250_000]);
  });

  it('로딩 중에는 캔버스를 걸지 않는다 — 빈 캔버스가 "데이터 없음"처럼 보이면 안 된다', () => {
    render(<ChartCanvas kind="line" labels={[]} series={[]} loading />);

    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(chartInstances()).toHaveLength(0);
  });

  it('데이터가 0건이면 빈 캔버스가 아니라 문구가 선다', () => {
    render(<ChartCanvas kind="bar" labels={[]} series={[]} emptyText="아직 집계된 매출이 없어요" />);

    expect(screen.getByText('아직 집계된 매출이 없어요')).toBeInTheDocument();
    expect(chartInstances()).toHaveLength(0);
  });

  it('값이 전부 없는 계열도 빈 데이터로 본다 (라벨만 있는 경우)', () => {
    render(<ChartCanvas kind="bar" labels={['1/1']} series={[{ label: '매출', data: [null] }]} />);

    expect(screen.getByText('데이터가 없어요')).toBeInTheDocument();
  });

  it('한국어 축 포맷이 설정에 실려 나간다 (원화 축약 + 축 제목)', () => {
    render(<ChartCanvas kind="line" unit="krw" labels={['1/1']} series={[{ label: '매출', data: [1_250_000] }]} />);

    const y = lastChart().config.options?.scales?.y as Record<string, Record<string, unknown>>;
    expect((y.ticks as { callback: (v: number) => string }).callback(1_250_000)).toBe('125만');
    expect((y.title as { text: string }).text).toBe('원');
  });

  it('데이터가 바뀌면 이전 차트를 파기하고 새로 그린다', () => {
    const { rerender } = render(
      <ChartCanvas kind="line" unit="krw" labels={['1/1']} series={series} />,
    );
    expect(liveCharts()).toHaveLength(1);

    rerender(
      <ChartCanvas
        kind="line"
        unit="krw"
        labels={['1/1', '1/2']}
        series={[{ label: '매출', data: [1, 2] }]}
      />,
    );

    expect(chartInstances()).toHaveLength(2);
    expect(chartInstances()[0].destroyed).toBe(true);
    expect(liveCharts()).toHaveLength(1);
    expect(lastChart().config.data.labels).toEqual(['1/1', '1/2']);
  });

  it('같은 데이터로 다시 렌더하면 차트를 새로 만들지 않는다', () => {
    const { rerender } = render(
      <ChartCanvas kind="line" unit="krw" labels={['1/1']} series={series} />,
    );
    rerender(<ChartCanvas kind="line" unit="krw" labels={['1/1']} series={series} />);

    expect(chartInstances()).toHaveLength(1);
  });

  it('화면에서 사라지면 차트를 파기한다 (캔버스 누수 방지)', () => {
    const { unmount } = render(
      <ChartCanvas kind="bar" labels={['1/1']} series={[{ label: '예약', data: [3] }]} />,
    );
    unmount();

    expect(liveCharts()).toHaveLength(0);
  });
});
