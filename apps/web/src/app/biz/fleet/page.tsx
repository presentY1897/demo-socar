'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  LEASE_STATUS_LABELS,
  isLeasePending,
  type FleetListRes,
} from '@socar/shared';
import { BizPermissionGate } from '@/components/BizPermissionGate';
import { LeaseDDayBadge } from '@/components/LeaseDDayBadge';
import { swrFetcher } from '@/lib/api';
import { fmtDate, krw } from '@/lib/format';

export default function BizFleetPage() {
  return (
    <BizPermissionGate permission="manageFleet">
      <FleetView />
    </BizPermissionGate>
  );
}

function FleetView() {
  const { data } = useSWR<FleetListRes>('/biz/fleet', swrFetcher);

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h1 className="text-xl font-bold">플릿</h1>
      <p className="mt-1 text-sm text-slate-500">법인이 리스한 차량의 계약·비용·이용 현황</p>

      {/* 계약 합계 */}
      {data && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">월 총 리스 비용</p>
          <p className="text-2xl font-bold text-slate-800">{krw(data.summary.monthlyTotalKrw)}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              차량 {data.summary.vehicleCount}대 · 계약 중 {data.summary.activeLeaseCount}건
            </span>
            {data.summary.expiringSoonCount > 0 && (
              <span className="font-semibold text-red-500">
                만기 임박 {data.summary.expiringSoonCount}건
              </span>
            )}
            {data.summary.pendingRequestCount > 0 && (
              <span className="font-semibold text-amber-600">
                처리 대기 {data.summary.pendingRequestCount}건
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {data?.items.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">리스한 차량이 없어요</p>
        )}
        {data?.items.map((v) => (
          <Link
            key={v.id}
            href={`/biz/fleet/${v.id}`}
            className="block rounded-xl bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {v.modelName}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{v.plateNo}</span>
                </p>
                <p className="truncate text-xs text-slate-400">{v.zone.name}</p>
              </div>
              {v.lease && <LeaseDDayBadge lease={v.lease} />}
            </div>

            {v.lease ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>월 {krw(v.lease.monthlyFeeKrw)}</span>
                <span>만기 {fmtDate(v.lease.endAt)}</span>
                {isLeasePending(v.lease.status) && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">
                    {LEASE_STATUS_LABELS[v.lease.status]}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">진행 중인 리스 계약이 없어요</p>
            )}

            {/* 최근 30일 이용률 */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">최근 {v.usage.windowDays}일 이용률</span>
                <span className="font-semibold text-slate-600">
                  {v.usage.utilizationPct}% · {v.usage.usedDays}일 · {v.usage.tripCount}회
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, v.usage.utilizationPct)}%` }}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
