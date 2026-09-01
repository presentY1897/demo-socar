'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { haversineMeters, onewayFee } from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { krw } from '@/lib/format';
import { TimeRangePicker } from '@/components/TimeRangePicker';

/** 예약 변경에 필요한 최소 형태 — 예약 상세 응답의 부분집합 */
export interface ModifiableReservation {
  id: string;
  startAt: string;
  endAt: string;
  onewayFeeKrw: number;
  returnZoneId: string | null;
  deliveryLabel: string | null;
  vehicle: { zone: { id: string; name: string; lat: number; lng: number } };
}

interface ReturnZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * 이용 전 예약 변경 — 시각 + 반납 존 (M1-5).
 *
 * 차액 미리보기는 서버와 같은 요금 엔진(onewayFee × 하버사인)을 그대로 돌린다.
 * 확정 금액은 PATCH 응답이 진실이다 — 편도 체인상 출발 존이 차량의 물리 존과 다를 수 있어
 * 미리보기는 "빌린 존 기준" 근사다 (ADR-005).
 */
export function ModifyReservationPanel({
  reservation,
  onDone,
}: {
  reservation: ModifiableReservation;
  onDone?: () => void | Promise<void>;
}) {
  const [range, setRange] = useState({ startAt: reservation.startAt, endAt: reservation.endAt });
  const [returnZoneId, setReturnZoneId] = useState(reservation.returnZoneId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 부름 예약은 탁송 일정이 얽혀 반납 존을 바꿀 수 없다 (편도와 배타)
  const isDelivery = reservation.deliveryLabel !== null;

  const { data: returnZones } = useSWR<ReturnZone[]>(
    isDelivery ? null : `/zones/${reservation.vehicle.zone.id}/return-zones`,
    swrFetcher,
  );

  const selectedZone = (returnZones ?? []).find((z) => z.id === returnZoneId);
  const nextOnewayFeeKrw = selectedZone
    ? onewayFee(haversineMeters(reservation.vehicle.zone, selectedZone))
    : 0;
  const delta = nextOnewayFeeKrw - reservation.onewayFeeKrw;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/reservations/${reservation.id}`, {
        method: 'PATCH',
        body: {
          startAt: range.startAt,
          endAt: range.endAt,
          // 빈 값 = 왕복 전환. 생략하면 서버가 기존 반납 존을 유지하므로 명시적으로 null을 보낸다
          returnZoneId: returnZoneId || null,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      await onDone?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '요청에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <TimeRangePicker
        startAt={range.startAt}
        endAt={range.endAt}
        onChange={(startAt, endAt) => setRange({ startAt, endAt })}
      />

      {isDelivery ? (
        <p className="mt-3 text-[11px] text-gray-400">
          부름 예약은 같은 자리에서 회수해요 — 반납 장소는 바꿀 수 없어요
        </p>
      ) : (
        <div className="mt-3">
          <label htmlFor="modify-return-zone" className="text-xs text-gray-400">
            반납 장소
          </label>
          <select
            id="modify-return-zone"
            value={returnZoneId}
            onChange={(e) => setReturnZoneId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">{reservation.vehicle.zone.name}에 반납 (왕복)</option>
            {(returnZones ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} — 편도
              </option>
            ))}
          </select>

          <p data-testid="oneway-fee-preview" className="mt-1.5 text-xs text-gray-500">
            편도 수수료 {krw(nextOnewayFeeKrw)}
            {delta > 0 && <span className="ml-1 text-sky-600">· 추가 결제 {krw(delta)}</span>}
            {delta < 0 && <span className="ml-1 text-emerald-600">· 크레딧 환급 {krw(-delta)}</span>}
            {delta === 0 && <span className="ml-1 text-gray-400">· 수수료 차액 없음</span>}
          </p>
        </div>
      )}

      <p className="mt-2 text-[11px] text-gray-400">차액은 추가 결제되거나 크레딧으로 환급돼요</p>

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      <button
        disabled={busy}
        onClick={submit}
        className="mt-2 w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? '변경 중...' : '이 내용으로 변경'}
      </button>
    </div>
  );
}
