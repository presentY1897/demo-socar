'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  OPS_ALERT_META,
  OPS_VEHICLE_STATE_META,
  fuelGaugeLabel,
  type OpsAlertRes,
  type OpsOverviewRes,
  type OpsTab,
} from '@socar/shared';
import type { VehicleMarker } from '@/components/ZoneMap';
import { swrFetcher } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { useLiveFleet } from '@/lib/ops-live';
import { Empty, Panel, StatCard } from './primitives';
import { SEVERITY_STYLE, stateBadgeClass, stateColor } from './state-style';

const ZoneMap = dynamic(() => import('@/components/ZoneMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-gray-400">지도를 불러오는 중...</div>
  ),
});

/**
 * ① 운영 홈 — "지금 무슨 일이 벌어지고 있나"에만 답한다.
 *
 * 매출·손익은 여기 없다(회계 탭으로 격리, M3-6). 이 화면이 답하는 질문은 셋뿐이다:
 * 지금 몇 대가 움직이나 · 사람이 손대야 할 일이 뭔가 · 그게 지도 어디에 있나.
 */
export function OpsHomeTab({ onNavigate }: { onNavigate: (tab: OpsTab, targetId?: string) => void }) {
  const { data: overview } = useSWR<OpsOverviewRes>('/ops/overview', swrFetcher);
  const { data: alerts } = useSWR<OpsAlertRes[]>('/ops/alerts', swrFetcher);

  const live = useLiveFleet(true);
  const [focusedVehicleId, setFocusedVehicleId] = useState<string | null>(null);

  const markers = useMemo<VehicleMarker[]>(
    () =>
      (live?.vehicles ?? []).map((v) => ({
        id: v.id,
        label: `${v.modelName} ${v.plateNo}`,
        lat: v.telemetry.lat,
        lng: v.telemetry.lng,
        color: stateColor(v.state),
      })),
    [live],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="지금 운행 중"
          value={overview ? `${overview.inUseCount}대` : '—'}
          sub={overview ? `전체 ${overview.vehicleCount}대 · 대기 ${overview.idleCount}대` : undefined}
        />
        <StatCard
          label="탁송 진행 중"
          value={overview ? `${overview.inTransitCount}대` : '—'}
          sub={overview ? `정비 ${overview.maintenanceCount}대` : undefined}
        />
        <StatCard label="오늘 예약" value={overview ? `${overview.todayReservationCount}건` : '—'} />
        <StatCard
          label="미배정 작업"
          value={overview ? `${overview.unassignedTaskCount}건` : '—'}
          sub={overview ? `답변 대기 문의 ${overview.openInquiryCount}건` : undefined}
          warn={(overview?.unassignedTaskCount ?? 0) > 0}
        />
      </div>

      {/* 경고 피드 — 목적지 탭은 서버가 실어 준다(alert.tab/targetId). 화면이 다시 판단하지 않는다 */}
      <Panel
        title="경고"
        action={
          <span className="text-[11px] text-gray-400">
            {alerts ? `${alerts.length}건` : '불러오는 중'}
          </span>
        }
      >
        <ul className="mt-2 space-y-1.5">
          {alerts?.length === 0 && <Empty>지금 손댈 경고가 없어요</Empty>}
          {alerts?.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => onNavigate(a.tab, a.targetId)}
                className={`flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left ${
                  SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.warn
                }`}
              >
                <span className="min-w-0">
                  <span className="text-[11px] font-semibold opacity-80">
                    {OPS_ALERT_META[a.kind].label}
                  </span>
                  <span className="block truncate text-sm font-medium">{a.title}</span>
                  <span className="block truncate text-[11px] opacity-80">{a.detail}</span>
                </span>
                <span className="shrink-0 self-center text-[11px] font-semibold opacity-70">
                  {a.dDay !== null ? `D-${a.dDay}` : a.at ? fmtTime(a.at) : ''} ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {/* 실시간 차량 지도 — SSE 틱마다 마커 좌표가 갱신된다 */}
      <Panel
        title="실시간 차량"
        action={
          live ? (
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              {fmtTime(live.ts)} 갱신
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">연결 중...</span>
          )
        }
      >
        <div className="mt-2 h-64 overflow-hidden rounded-lg">
          <ZoneMap
            zones={[]}
            selectedId={null}
            onSelect={() => {}}
            vehicles={markers}
            selectedVehicleId={focusedVehicleId}
            onSelectVehicle={setFocusedVehicleId}
          />
        </div>

        <ul className="mt-2 divide-y divide-gray-50">
          {(live?.vehicles ?? []).map((v) => (
            <li key={v.id}>
              <button
                onClick={() => setFocusedVehicleId(v.id)}
                className={`flex w-full items-center justify-between gap-2 py-1.5 text-left text-sm ${
                  focusedVehicleId === v.id ? 'font-semibold' : ''
                }`}
              >
                <span className="min-w-0 truncate">
                  <span>{v.modelName}</span>{' '}
                  <span className="text-xs text-gray-400">{v.plateNo}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                  <span>
                    {fuelGaugeLabel(v.fuel)} {Math.round(v.telemetry.fuelPct)}%
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${stateBadgeClass(v.state)}`}>
                    {OPS_VEHICLE_STATE_META[v.state].label}
                  </span>
                  <span>{v.dueBack ? `${fmtTime(v.dueBack)} 반납` : '—'}</span>
                </span>
              </button>
            </li>
          ))}
          {!live && <Empty>실시간 데이터를 기다리는 중...</Empty>}
        </ul>
      </Panel>
    </div>
  );
}
