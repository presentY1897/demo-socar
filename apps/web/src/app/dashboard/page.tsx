'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
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
import {
  OPS_VEHICLE_STATE_META,
  type LiveVehicleRes,
  type LiveVehiclesEvent,
  type OpsVehicleState,
} from '@socar/shared';
import { API_URL, getToken, swrFetcher } from '@/lib/api';
import { fmtTime, krw } from '@/lib/format';
import { useSession } from '@/lib/session';

interface Summary {
  days: number;
  vehicleCount: number;
  reservationCount: number;
  revenueKrw: number;
  utilizationPct: number;
  lateReturnPct: number;
  activeRentals: number;
}
interface DailyRow {
  day: string;
  reservations: number;
  revenueKrw: number;
}
// 상태 4종(대기/운행/탁송/정비)과 라벨은 shared가 단일 소스 — 운영 화면(M3-4~6)도 같은 값을 본다
const STATE_STYLE: Record<OpsVehicleState, string> = {
  IDLE: 'bg-gray-100 text-gray-500',
  IN_USE: 'bg-green-100 text-green-700',
  IN_TRANSIT: 'bg-amber-100 text-amber-700',
  MAINTENANCE: 'bg-red-50 text-red-500',
};

export default function DashboardPage() {
  const { user, ready } = useSession();
  const isOps = user?.role === 'OPS_ADMIN';
  const { data: summary } = useSWR<Summary>(isOps ? '/metrics/summary?days=30' : null, swrFetcher);
  const { data: daily } = useSWR<DailyRow[]>(isOps ? '/metrics/daily?days=14' : null, swrFetcher);

  const [live, setLive] = useState<LiveVehicleRes[] | null>(null);
  const [liveTs, setLiveTs] = useState<string | null>(null);

  useEffect(() => {
    if (!isOps) return;
    const token = getToken();
    const es = new EventSource(`${API_URL}/metrics/vehicles/live?token=${token}`);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data) as LiveVehiclesEvent;
      setLive(payload.vehicles);
      setLiveTs(payload.ts);
    };
    return () => es.close();
  }, [isOps]);

  if (ready && !isOps) {
    return <p className="py-16 text-center text-sm text-gray-400">운영 어드민 계정으로 로그인하세요</p>;
  }

  const chartData = (daily ?? []).map((d) => ({
    ...d,
    label: d.day.slice(5).replace('-', '/'),
    revenueMan: Math.round(d.revenueKrw / 10000),
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <h1 className="text-xl font-bold">운영 대시보드</h1>
      <p className="text-sm text-gray-500">최근 30일 기준</p>

      {/* 지표 카드 */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="매출" value={summary ? krw(summary.revenueKrw) : '—'} />
        <StatCard label="예약 건수" value={summary ? `${summary.reservationCount}건` : '—'} />
        <StatCard
          label="차량 가동률"
          value={summary ? `${summary.utilizationPct}%` : '—'}
          sub={summary ? `차량 ${summary.vehicleCount}대` : undefined}
        />
        <StatCard
          label="지연 반납률"
          value={summary ? `${summary.lateReturnPct}%` : '—'}
          sub={summary ? `현재 이용 중 ${summary.activeRentals}건` : undefined}
          warn={(summary?.lateReturnPct ?? 0) >= 15}
        />
      </div>

      {/* 차트 */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">일별 예약 건수 (14일)</h2>
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
          <h2 className="text-sm font-semibold">일별 매출 (만원, 14일)</h2>
          <div className="mt-2 h-48">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={10} tickLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="revenueMan" name="매출(만원)" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 실시간 차량 현황 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">실시간 차량 현황 (SSE)</h2>
          {liveTs && (
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              {fmtTime(liveTs)} 갱신
            </span>
          )}
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-400">
                <th className="py-1.5 font-normal">차량</th>
                <th className="font-normal">존</th>
                <th className="font-normal">상태</th>
                <th className="font-normal">반납 예정</th>
              </tr>
            </thead>
            <tbody>
              {(live ?? []).map((v) => (
                <tr key={v.id} className="border-b border-gray-50">
                  <td className="py-1.5">
                    {v.modelName} <span className="text-xs text-gray-400">{v.plateNo}</span>
                  </td>
                  <td className="text-xs text-gray-500">{v.zone.name}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATE_STYLE[v.state]}`}>
                      {OPS_VEHICLE_STATE_META[v.state].label}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500">{v.dueBack ? fmtTime(v.dueBack) : '—'}</td>
                </tr>
              ))}
              {!live && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-gray-400">연결 중...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${warn ? 'text-red-500' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}
