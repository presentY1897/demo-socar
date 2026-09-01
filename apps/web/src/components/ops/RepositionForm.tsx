'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  createRepositionTaskSchema,
  type OpsFleetVehicleRes,
  type OpsZoneRes,
} from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { kstIso, todayKst } from '@/lib/format';
import { ErrorNote, FormField, inputClass } from './primitives';

/**
 * 재배치(REPOSITION) 작업 수동 생성.
 *
 * 출발 존은 보내지 않는다 — 차량이 실제로 서 있는 곳을 서버가 채운다. 운영자가 고른
 * 출발지와 실제가 다르면 아무도 수행할 수 없는 작업이 생기기 때문이다(M2-4).
 */
export function RepositionForm({ onCreated }: { onCreated: () => void }) {
  const { data: vehicles } = useSWR<OpsFleetVehicleRes[]>('/ops/fleet', swrFetcher);
  const { data: zones } = useSWR<OpsZoneRes[]>('/ops/zones', swrFetcher);

  const [vehicleId, setVehicleId] = useState('');
  const [toZoneId, setToZoneId] = useState('');
  const [date, setDate] = useState(todayKst());
  const [time, setTime] = useState('18:00');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = vehicles?.find((v) => v.id === vehicleId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createRepositionTaskSchema.safeParse({
      vehicleId,
      toZoneId,
      dueAt: kstIso(date, time),
    });
    if (!parsed.success) {
      setError('차량과 도착 존, 기한을 모두 골라 주세요');
      return;
    }
    if (selected && selected.zone.id === toZoneId) {
      setError('출발과 도착이 같은 존이에요');
      return;
    }

    setBusy(true);
    try {
      await api('/ops/tasks', { method: 'POST', body: parsed.data });
      setVehicleId('');
      setToZoneId('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '작업 생성에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="재배치 작업 생성" className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="차량">
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className={inputClass}
          >
            <option value="">선택하세요</option>
            {vehicles?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.modelName} {v.plateNo} ({v.zone.name})
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="도착 존">
          <select
            value={toZoneId}
            onChange={(e) => setToZoneId(e.target.value)}
            className={inputClass}
          >
            <option value="">선택하세요</option>
            {zones?.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} (잔여 {z.freeSlots})
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="기한 날짜">
          <input
            type="date"
            value={date}
            min={todayKst()}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </FormField>
        <FormField label="기한 시각">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputClass}
          />
        </FormField>
      </div>

      {/* 출발 존은 차량이 정한다 — 폼에 두면 실제와 어긋난 값을 고를 수 있다 */}
      {selected && (
        <p className="text-[11px] text-gray-400">
          출발은 차량이 서 있는 {selected.zone.name} 입니다
        </p>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <button
        disabled={busy}
        className="w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? '생성 중...' : '재배치 작업 만들기'}
      </button>
    </form>
  );
}
