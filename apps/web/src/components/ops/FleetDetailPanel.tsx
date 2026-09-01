'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  OPS_VEHICLE_STATE_META,
  VEHICLE_CONTROL_META,
  createMaintenanceNoteSchema,
  fuelGaugeLabel,
  type OpsFleetDetailRes,
} from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { FUEL_LABEL, fmtDate, fmtDateTime, krw } from '@/lib/format';
import { DDayBadge, Empty, ErrorNote, Field, FuelGauge } from './primitives';
import { stateBadgeClass } from './state-style';

/** 센서 값은 조회 시점 계산값이라 다시 읽으면 움직인다 — SSE 틱과 같은 5초 주기로 맞춘다 */
const SENSOR_REFRESH_MS = 5000;

/**
 * 차량 상세 패널 — 표에서 한 대를 골랐을 때 여는 "이 차의 지금과 내력".
 *
 * 센서 값·스마트키 상태가 한 응답에서 온다(M3-1에서 Vehicle의 임시 필드를 Telemetry로 통합).
 * 정비 메모는 덮어쓰지 않고 이력으로 쌓인다 — 누가 언제 무엇을 봤는지가 남아야 한다.
 */
export function FleetDetailPanel({ vehicleId, onClose }: { vehicleId: string; onClose: () => void }) {
  const { data, mutate } = useSWR<OpsFleetDetailRes>(`/ops/fleet/${vehicleId}`, swrFetcher, {
    refreshInterval: SENSOR_REFRESH_MS,
  });

  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createMaintenanceNoteSchema.safeParse({ body: note });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/ops/fleet/${vehicleId}/notes`, { method: 'POST', body: parsed.data });
      setNote('');
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '메모 저장에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <section aria-label="차량 상세" className="mt-3 rounded-xl bg-white p-4 shadow-sm">
        <Empty>차량 정보를 불러오는 중...</Empty>
      </section>
    );
  }

  const t = data.telemetry;

  return (
    <section aria-label="차량 상세" className="mt-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <span>{data.modelName}</span>
            <span className="ml-1.5 text-xs font-normal text-gray-400">{data.plateNo}</span>
          </h3>
          <p className="truncate text-xs text-gray-400">
            {data.zone.name} · {FUEL_LABEL[data.fuel]} · {data.seats}인승
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${stateBadgeClass(data.state)}`}>
            {OPS_VEHICLE_STATE_META[data.state].label}
          </span>
          <button onClick={onClose} className="text-xs text-gray-400">
            닫기
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {/* 센서 — 스마트키 상태(문/시동)도 같은 텔레메트리에서 온다 */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500">센서</h4>
          <div className="mt-1">
            <FuelGauge label={fuelGaugeLabel(data.fuel)} pct={t.fuelPct} low={data.lowFuel} />
          </div>
          <Field label="주행거리" value={`${t.odometerKm.toLocaleString('ko-KR')} km`} />
          <Field label="문" value={t.doorLocked ? '잠김' : '열림'} />
          <Field label="시동" value={t.engineOn ? '켜짐' : '꺼짐'} />
          <Field label="좌표" value={`${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}`} />
          <Field label="갱신" value={fmtDateTime(t.updatedAt)} />
        </div>

        {/* 도입/보험 — 회계 탭의 비용이 여기서 나온다 */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500">도입 · 보험</h4>
          {data.finance ? (
            <>
              <Field
                label="도입"
                value={
                  data.finance.acquisitionType === 'LEASE'
                    ? `리스 · 월 ${krw(data.finance.monthlyLeaseKrw ?? 0)}`
                    : `구매 · ${krw(data.finance.acquisitionCostKrw ?? 0)}`
                }
              />
              <Field label="도입일" value={fmtDate(data.finance.acquiredAt)} />
              <Field label="보험사" value={data.finance.insurerName} />
              <Field label="보험료" value={`월 ${krw(data.finance.insurancePremiumKrw)}`} />
              <Field
                label="보험 만기"
                value={
                  <span className="flex items-center justify-end gap-1.5">
                    {fmtDate(data.finance.insuranceExpiresAt)}
                    <DDayBadge
                      dDay={data.finance.insuranceDDay}
                      soon={data.finance.insuranceExpiringSoon}
                    />
                  </span>
                }
              />
            </>
          ) : (
            <p className="mt-1 text-xs text-gray-400">도입 정보가 없어요</p>
          )}
        </div>
      </div>

      {/* 스마트키 조작 이력 */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold text-gray-500">스마트키 조작 이력</h4>
        <ul className="mt-1 space-y-0.5">
          {data.controlLogs.length === 0 && (
            <li className="text-xs text-gray-400">조작 이력이 없어요</li>
          )}
          {data.controlLogs.map((log) => (
            <li key={log.id} className="flex justify-between text-xs">
              <span>
                {VEHICLE_CONTROL_META[log.action].icon} {VEHICLE_CONTROL_META[log.action].label}
              </span>
              <span className="text-gray-400">{fmtDateTime(log.at)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 정비 메모 */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold text-gray-500">정비 메모</h4>
        <form onSubmit={addNote} className="mt-1 flex gap-2">
          <input
            aria-label="정비 메모"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 앞 타이어 편마모 확인"
            className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <button
            disabled={busy}
            className="shrink-0 rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            저장
          </button>
        </form>
        {error && <ErrorNote>{error}</ErrorNote>}
        <ul className="mt-2 space-y-1.5">
          {data.maintenanceNotes.length === 0 && (
            <li className="text-xs text-gray-400">아직 메모가 없어요</li>
          )}
          {data.maintenanceNotes.map((n) => (
            <li key={n.id} className="rounded-lg bg-gray-50 p-2 text-xs">
              <p>{n.body}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {n.authorName ?? '알 수 없음'} · {fmtDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
