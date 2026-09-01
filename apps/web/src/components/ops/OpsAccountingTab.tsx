'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type {
  MetricsDailyRowRes,
  MetricsSummaryRes,
  OpsAccountingSummaryRes,
} from '@socar/shared';
import { swrFetcher } from '@/lib/api';
import { krw } from '@/lib/format';
import { AccountingCharts } from './AccountingCharts';
import { Empty, Panel, StatCard } from './primitives';

/** 매출 집계 창 — 비용은 월 고정비라 이 값을 바꿔도 움직이지 않는다 */
const RANGES = [7, 30, 90] as const;
/** 일별 차트 구간 — 집계 창과 별개로 "최근 흐름"을 보는 눈금이다 */
const DAILY_DAYS = 14;

/**
 * ⑥ 회계 — 매출·비용·손익을 여기에 격리한다 (피드백 #4).
 *
 * 운영 홈에서 걷어낸 매출/예약/가동률 지표와 일별 차트가 이 탭으로 왔다.
 * **매출은 기간 집계, 비용은 월 고정비**라 성격이 다르다 — 기간을 바꾸면 이용 매출만
 * 움직이므로 화면이 그 점을 적어 둔다. 적지 않으면 "90일로 넓혔더니 손익이 좋아졌다"는
 * 착시가 생긴다.
 */
export function OpsAccountingTab() {
  const [days, setDays] = useState<number>(30);

  const { data: acc } = useSWR<OpsAccountingSummaryRes>(
    `/ops/accounting/summary?days=${days}`,
    swrFetcher,
  );
  const { data: metrics } = useSWR<MetricsSummaryRes>(`/metrics/summary?days=${days}`, swrFetcher);
  const { data: daily } = useSWR<MetricsDailyRowRes[]>(
    `/metrics/daily?days=${DAILY_DAYS}`,
    swrFetcher,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="집계 기간">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-full px-2.5 py-1 text-xs ${
                days === d ? 'bg-sky-500 font-semibold text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              최근 {d}일
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">
          비용은 월 고정비라 기간을 바꿔도 그대로예요
        </p>
      </div>

      {/* 월 손익 요약 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={`매출 (최근 ${days}일)`}
          value={acc ? krw(acc.revenue.totalKrw) : '—'}
          sub={acc ? `이용 ${krw(acc.revenue.rentalKrw)} · 리스 ${krw(acc.revenue.leaseKrw)}` : undefined}
        />
        <StatCard
          label="비용 (월 고정)"
          value={acc ? krw(acc.cost.totalKrw) : '—'}
          sub={acc ? `차량 ${acc.counts.vehicleCount}대 · 유료 존 ${acc.counts.paidZoneCount}곳` : undefined}
        />
        <StatCard
          label="손익"
          value={acc ? krw(acc.profitKrw) : '—'}
          warn={(acc?.profitKrw ?? 0) < 0}
        />
        <StatCard label="마진율" value={acc ? `${acc.marginPct}%` : '—'} />
      </div>

      {/* 비용 구성 — 차트 라이브러리 없이 비율 막대로 (M4-1 교체 대상 아님) */}
      <Panel title="비용 구성">
        {acc ? (
          <ul className="mt-2 space-y-2">
            <CostRow label="차량 리스료" amount={acc.cost.vehicleLeaseKrw} total={acc.cost.totalKrw} />
            <CostRow label="보험료" amount={acc.cost.insuranceKrw} total={acc.cost.totalKrw} />
            <CostRow
              label="주차장 계약비"
              amount={acc.cost.zoneContractKrw}
              total={acc.cost.totalKrw}
            />
          </ul>
        ) : (
          <Empty>회계 요약을 불러오는 중...</Empty>
        )}
      </Panel>

      {/* 운영 홈에서 옮겨 온 지표 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="예약 건수" value={metrics ? `${metrics.reservationCount}건` : '—'} />
        <StatCard
          label="차량 가동률"
          value={metrics ? `${metrics.utilizationPct}%` : '—'}
          sub={metrics ? `차량 ${metrics.vehicleCount}대` : undefined}
        />
        <StatCard
          label="지연 반납률"
          value={metrics ? `${metrics.lateReturnPct}%` : '—'}
          sub={metrics ? `현재 이용 중 ${metrics.activeRentals}건` : undefined}
          warn={(metrics?.lateReturnPct ?? 0) >= 15}
        />
        <StatCard
          label="진행 중 리스"
          value={acc ? `${acc.counts.activeLeaseCount}건` : '—'}
          sub={acc ? `리스 차량 ${acc.counts.leasedVehicleCount}대` : undefined}
        />
      </div>

      <AccountingCharts daily={daily ?? []} />
    </div>
  );
}

function CostRow({ label, amount, total }: { label: string; amount: number; total: number }) {
  const pct = total > 0 ? Math.round((amount / total) * 1000) / 10 : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="text-gray-600">
          {krw(amount)} <span className="text-[11px] text-gray-400">{pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
