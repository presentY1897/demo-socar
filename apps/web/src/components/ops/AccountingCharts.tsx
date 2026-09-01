'use client';

import type { MetricsDailyRowRes } from '@socar/shared';
import { ChartCanvas } from '@/components/charts/ChartCanvas';
import { CHART_COLORS, dayTickLabel } from '@/lib/chart-config';
import { Panel } from './primitives';

/**
 * 회계 탭의 일별 차트 — M4-1에서 Recharts를 걷어내고 공용 래퍼(`ChartCanvas`)로 갈아 끼웠다.
 *
 * 예약은 하루 단위로 세는 값이라 막대, 매출은 흐름을 보는 값이라 선으로 둔다.
 * 매출 축은 래퍼가 만/억으로 접어 주므로 제목에서 "(만원)"을 뗐다 — 단위를 제목에 적어 두면
 * 축 눈금이 바뀌었을 때 제목만 옛 단위로 남는다.
 */
export function AccountingCharts({
  daily,
  loading,
}: {
  daily: MetricsDailyRowRes[];
  loading?: boolean;
}) {
  const labels = daily.map((d) => dayTickLabel(d.day));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="일별 예약 건수">
        <div className="mt-2">
          <ChartCanvas
            kind="bar"
            labels={labels}
            unit="count"
            series={[{ label: '예약', data: daily.map((d) => d.reservations) }]}
            loading={loading}
            ariaLabel="일별 예약 건수 차트"
            emptyText="아직 집계된 예약이 없어요"
          />
        </div>
      </Panel>

      <Panel title="일별 매출">
        <div className="mt-2">
          <ChartCanvas
            kind="line"
            labels={labels}
            unit="krw"
            series={[
              { label: '매출', data: daily.map((d) => d.revenueKrw), color: CHART_COLORS[1] },
            ]}
            loading={loading}
            ariaLabel="일별 매출 차트"
            emptyText="아직 집계된 매출이 없어요"
          />
        </div>
      </Panel>
    </div>
  );
}
