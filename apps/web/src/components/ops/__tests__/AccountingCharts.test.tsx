import { describe, expect, it, vi } from 'vitest';
import { AccountingCharts } from '@/components/ops/AccountingCharts';
import { chartInstances } from '@/test/chart';
import { metricsDaily } from '@/test/msw/fixtures';
import { render, screen } from '@/test/utils';

vi.mock('@/components/charts/chart-lib', async () => (await import('@/test/chart')).chartLibMock());

/**
 * 회계 탭의 일별 차트 — M4-1이 Recharts에서 공용 래퍼로 갈아 끼운 자리.
 * 회계 탭 테스트는 이 모듈을 대역으로 두고 값만 보므로, "정말 차트로 나가는가"는 여기서 본다.
 */
describe('회계 일별 차트 (Chart.js)', () => {
  it('예약은 막대, 매출은 선으로 지표 데이터를 그대로 싣는다', () => {
    render(<AccountingCharts daily={metricsDaily} />);

    expect(screen.getByText('일별 예약 건수')).toBeInTheDocument();
    expect(screen.getByText('일별 매출')).toBeInTheDocument();

    const [reservations, revenue] = chartInstances();
    expect(reservations.config.type).toBe('bar');
    expect(reservations.config.data.datasets[0].data).toEqual(
      metricsDaily.map((d) => d.reservations),
    );

    expect(revenue.config.type).toBe('line');
    expect(revenue.config.data.datasets[0].data).toEqual(metricsDaily.map((d) => d.revenueKrw));
  });

  it('x축은 연도를 뗀 날짜 라벨이다', () => {
    render(<AccountingCharts daily={metricsDaily.slice(0, 2)} />);

    // 픽스처는 2030-01-01, 2030-01-02
    expect(chartInstances()[0].config.data.labels).toEqual(['1/1', '1/2']);
  });

  it('매출 축은 원화로 축약되고 예약 축은 건수다', () => {
    render(<AccountingCharts daily={metricsDaily} />);

    const [reservations, revenue] = chartInstances();
    const axisTitle = (chart: typeof reservations) =>
      (
        (chart.config.options?.scales?.y as Record<string, Record<string, unknown>>).title as {
          text: string;
        }
      ).text;

    expect(axisTitle(reservations)).toBe('건');
    expect(axisTitle(revenue)).toBe('원');
  });

  it('불러오는 중에는 캔버스 대신 문구가 선다', () => {
    render(<AccountingCharts daily={[]} loading />);

    expect(screen.getAllByText('불러오는 중...')).toHaveLength(2);
    expect(chartInstances()).toHaveLength(0);
  });

  it('집계된 데이터가 없으면 차트 자리에 "없어요"가 남는다', () => {
    render(<AccountingCharts daily={[]} />);

    expect(screen.getByText('아직 집계된 예약이 없어요')).toBeInTheDocument();
    expect(screen.getByText('아직 집계된 매출이 없어요')).toBeInTheDocument();
    expect(chartInstances()).toHaveLength(0);
  });
});
