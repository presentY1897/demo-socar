'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MetricsDailyRowRes } from '@socar/shared';

/**
 * 회계 탭의 일별 차트 — **M4-1이 통째로 갈아 끼울 지점**.
 *
 * M3-6은 기존 `/dashboard`의 Recharts 차트를 그대로 옮기기만 했다(작업 문서 지시).
 * Chart.js 전면 전환(M4-1)에서 Recharts를 제거할 때 손댈 파일이 이 하나가 되도록
 * 차트만 여기에 모았다 — 바깥(손익 카드·비용 구성·지표)에는 차트 라이브러리가 없다.
 */
export function AccountingCharts({ daily }: { daily: MetricsDailyRowRes[] }) {
  const chartData = daily.map((d) => ({
    ...d,
    label: d.day.slice(5).replace('-', '/'),
    revenueMan: Math.round(d.revenueKrw / 10000),
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">일별 예약 건수</h2>
        <div className="mt-2 h-48">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={10} tickLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="reservations" name="예약" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">일별 매출 (만원)</h2>
        <div className="mt-2 h-48">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={10} tickLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="revenueMan"
                name="매출(만원)"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
