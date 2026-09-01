'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  OPS_VEHICLE_STATE_META,
  fuelGaugeLabel,
  opsVehicleStateSchema,
  type OpsFleetVehicleRes,
  type OpsVehicleState,
} from '@socar/shared';
import { ExportButtons } from '@/components/ExportButtons';
import { swrFetcher } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { FLEET_SORT_LABEL, sortFleet, type FleetSortKey, type SortDir } from '@/lib/ops-fleet';
import { FleetDetailPanel } from './FleetDetailPanel';
import { VehicleCreateForm } from './VehicleCreateForm';
import { DDayBadge, Empty, FuelGauge, Panel } from './primitives';
import { stateBadgeClass } from './state-style';

/**
 * ② 차량(Fleet) — "전 차량이 지금 어떤 상태인가"에 답하는 표.
 *
 * 상태 목록·라벨은 shared(opsVehicleStateSchema · OPS_VEHICLE_STATE_META)에서 온다.
 * 정렬은 순수 함수(lib/ops-fleet)가 하고 여기서는 어떤 키로 볼지만 고른다.
 */
export function OpsFleetTab({ targetId }: { targetId?: string | null }) {
  const [state, setState] = useState<OpsVehicleState | ''>('');
  const [sortKey, setSortKey] = useState<FleetSortKey>('plateNo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 화면이 쓰는 쿼리 한 벌 — 조회와 내보내기가 같은 조건을 본다 (M4-4).
  // 정렬은 화면에서도 하지만(즉시 반응) 서버도 같은 함수를 쓰므로 파일 순서가 표와 같다.
  const query = new URLSearchParams({ sort: sortKey, dir: sortDir });
  if (state) query.set('state', state);

  const { data, mutate } = useSWR<OpsFleetVehicleRes[]>(
    state ? `/ops/fleet?state=${state}` : '/ops/fleet',
    swrFetcher,
  );

  // 경고 피드에서 넘어온 차량은 필터를 거치지 않고 바로 연다 (서버가 준 targetId)
  useEffect(() => {
    if (targetId) setOpenId(targetId);
  }, [targetId]);

  const rows = useMemo(() => sortFleet(data ?? [], sortKey, sortDir), [data, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      <Panel
        title="차량"
        action={
          <span className="flex items-center gap-1">
            <ExportButtons path="/ops/fleet" query={query.toString()} label="차량목록" />
            <button
              onClick={() => setCreating((v) => !v)}
              className="rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-600"
            >
              {creating ? '등록 닫기' : '차량 등록'}
            </button>
          </span>
        }
      >
        {creating && (
          <VehicleCreateForm
            onCreated={async (id) => {
              setCreating(false);
              // 표를 다시 읽어 새 차가 바로 보이게 하고, 그 차의 상세를 연다
              await mutate();
              setOpenId(id);
            }}
          />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="상태 필터">
            <FilterChip active={state === ''} onClick={() => setState('')}>
              전체
            </FilterChip>
            {opsVehicleStateSchema.options.map((s) => (
              <FilterChip key={s} active={state === s} onClick={() => setState(s)}>
                {OPS_VEHICLE_STATE_META[s].label}
              </FilterChip>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <label className="text-[11px] text-gray-400" htmlFor="fleet-sort">
              정렬
            </label>
            <select
              id="fleet-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as FleetSortKey)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            >
              {Object.entries(FLEET_SORT_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label="정렬 방향"
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-500"
            >
              {sortDir === 'asc' ? '오름차순' : '내림차순'}
            </button>
          </div>
        </div>

        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-400">
                <th className="py-1.5 font-normal">차량</th>
                <th className="font-normal">상태</th>
                <th className="font-normal">배정 존</th>
                <th className="font-normal">연료·배터리</th>
                <th className="font-normal">주행거리</th>
                <th className="font-normal">다음 예약</th>
                <th className="font-normal">보험</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => setOpenId(v.id === openId ? null : v.id)}
                  className={`cursor-pointer border-b border-gray-50 ${
                    v.id === openId ? 'bg-sky-50' : ''
                  }`}
                >
                  <td className="py-1.5">
                    <span className="font-medium">{v.modelName}</span>{' '}
                    <span className="text-xs text-gray-400">{v.plateNo}</span>
                  </td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${stateBadgeClass(v.state)}`}>
                      {OPS_VEHICLE_STATE_META[v.state].label}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500">{v.zone.name}</td>
                  <td>
                    <FuelGauge
                      label={fuelGaugeLabel(v.fuel)}
                      pct={v.telemetry.fuelPct}
                      low={v.lowFuel}
                    />
                  </td>
                  <td className="text-xs text-gray-500">
                    {Math.round(v.telemetry.odometerKm).toLocaleString('ko-KR')} km
                  </td>
                  <td className="text-xs text-gray-500">
                    {v.nextReservation ? fmtDateTime(v.nextReservation.startAt) : '—'}
                  </td>
                  <td>
                    {v.insurance ? (
                      <DDayBadge dDay={v.insurance.dDay} soon={v.insurance.expiringSoon} />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty>이 조건에 맞는 차량이 없어요</Empty>
                  </td>
                </tr>
              )}
              {!data && (
                <tr>
                  <td colSpan={7}>
                    <Empty>차량을 불러오는 중...</Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {openId && <FleetDetailPanel vehicleId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs ${
        active ? 'bg-sky-500 font-semibold text-white' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {children}
    </button>
  );
}
