'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { api, ApiError, swrFetcher } from '@/lib/api';
import {
  fmtDateTime,
  INSURANCE_LABEL,
  krw,
  RESERVATION_STATUS_LABEL,
} from '@/lib/format';

interface Detail {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  insurance: string;
  rentalFeeKrw: number;
  insuranceFeeKrw: number;
  discountKrw: number;
  creditUsedKrw: number;
  totalUpfrontKrw: number;
  vehicle: {
    modelName: string;
    plateNo: string;
    zone: { name: string; address: string };
    plan: { perKmKrw: number };
  };
  payments: {
    id: string;
    kind: string;
    amountKrw: number;
    status: string;
    cardLast4: string | null;
    approvedAt: string | null;
  }[];
  rental: {
    id: string;
    status: string;
    startedAt: string;
    returnedAt: string | null;
    distanceKm: number | null;
    lateMinutes: number;
    driveFeeKrw: number | null;
    lateFeeKrw: number | null;
  } | null;
}

const PAYMENT_KIND_LABEL: Record<string, string> = {
  UPFRONT: '대여요금 선결제',
  DRIVE_SETTLEMENT: '주행요금 정산',
  PENALTY: '페널티',
};
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CAPTURED: '결제 완료',
  REFUNDED: '환불됨',
  PENDING: '대기',
  FAILED: '실패',
};

export default function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, mutate } = useSWR<Detail>(`/reservations/${id}`, swrFetcher, {
    refreshInterval: 10000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState('');
  const [showReturn, setShowReturn] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await mutate();
      setShowReturn(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '요청에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="py-16 text-center text-sm text-gray-400">불러오는 중...</p>;

  const canStart =
    data.status === 'CONFIRMED' &&
    dayjs().isAfter(dayjs(data.startAt).subtract(10, 'minute')) &&
    dayjs().isBefore(dayjs(data.endAt));
  const canCancel = data.status === 'CONFIRMED' && dayjs().isBefore(dayjs(data.startAt));

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <button onClick={() => router.back()} className="text-sm text-gray-400">← 뒤로</button>

      <div className="mt-2 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">
            {data.vehicle.modelName}
            <span className="ml-2 text-sm font-normal text-gray-400">{data.vehicle.plateNo}</span>
          </h1>
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
            {RESERVATION_STATUS_LABEL[data.status]}
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          {fmtDateTime(data.startAt)} ~ {fmtDateTime(data.endAt)}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {data.vehicle.zone.name} · {data.vehicle.zone.address} · {INSURANCE_LABEL[data.insurance]}
        </p>
      </div>

      {/* 이용 중 카드 */}
      {data.status === 'IN_USE' && data.rental && (
        <div className="mt-4 rounded-xl border-2 border-green-300 bg-green-50 p-4">
          <p className="font-semibold text-green-800">🚗 이용 중</p>
          <p className="mt-1 text-sm text-green-700">
            {fmtDateTime(data.rental.startedAt)}에 시작 · 반납 예정 {fmtDateTime(data.endAt)}
          </p>
          {data.rental.status === 'IN_USE' && !showReturn && (
            <button
              onClick={() => setShowReturn(true)}
              className="mt-3 w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white"
            >
              반납하기
            </button>
          )}
          {showReturn && (
            <div className="mt-3 rounded-lg bg-white p-3">
              <label className="text-sm text-gray-600">주행거리 입력 (km) — 실제로는 차량 텔레메트리</label>
              <input
                type="number"
                min={0}
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="예: 23.5"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">
                주행요금 {krw(data.vehicle.plan.perKmKrw)}/km · 지연 반납 시 분당 200원
              </p>
              <button
                disabled={busy || distanceKm === ''}
                onClick={() =>
                  act(() =>
                    api(`/rentals/${data.rental!.id}/return`, {
                      method: 'POST',
                      body: { distanceKm: Number(distanceKm) },
                    }),
                  )
                }
                className="mt-2 w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? '정산 중...' : '반납 및 정산'}
              </button>
            </div>
          )}
          {data.rental.status === 'RETURN_PENDING' && (
            <button
              disabled={busy}
              onClick={() => act(() => api(`/rentals/${data.rental!.id}/settle`, { method: 'POST' }))}
              className="mt-3 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white"
            >
              정산 재시도
            </button>
          )}
        </div>
      )}

      {/* 액션 */}
      {(canStart || canCancel) && (
        <div className="mt-4 flex gap-2">
          {canStart && (
            <button
              disabled={busy}
              onClick={() => act(() => api('/rentals/start', { method: 'POST', body: { reservationId: data.id } }))}
              className="flex-1 rounded-xl bg-sky-500 py-3 font-semibold text-white disabled:opacity-40"
            >
              🔓 스마트키 — 이용 시작
            </button>
          )}
          {canCancel && (
            <button
              disabled={busy}
              onClick={() => act(() => api(`/reservations/${data.id}/cancel`, { method: 'POST' }))}
              className="flex-1 rounded-xl border border-red-200 bg-white py-3 font-semibold text-red-500 disabled:opacity-40"
            >
              예약 취소
            </button>
          )}
        </div>
      )}
      {data.status === 'CONFIRMED' && !canStart && (
        <p className="mt-3 text-center text-xs text-gray-400">예약 시작 10분 전부터 스마트키를 쓸 수 있어요</p>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {/* 요금 내역 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm text-sm">
        <h2 className="font-semibold">요금 내역</h2>
        <div className="mt-2 space-y-1">
          <Row label="대여요금" value={krw(data.rentalFeeKrw)} />
          <Row label="면책상품" value={krw(data.insuranceFeeKrw)} />
          {data.discountKrw > 0 && <Row label="쿠폰 할인" value={`-${krw(data.discountKrw)}`} />}
          {data.creditUsedKrw > 0 && <Row label="크레딧" value={`-${krw(data.creditUsedKrw)}`} />}
          <Row label="선결제 합계" value={krw(data.totalUpfrontKrw)} bold />
          {data.rental?.driveFeeKrw != null && (
            <>
              <div className="border-t border-dashed pt-1" />
              <Row label={`주행요금 (${data.rental.distanceKm}km)`} value={krw(data.rental.driveFeeKrw)} />
              {(data.rental.lateFeeKrw ?? 0) > 0 && (
                <Row label={`지연 반납 (${data.rental.lateMinutes}분)`} value={krw(data.rental.lateFeeKrw!)} />
              )}
            </>
          )}
        </div>
      </div>

      {/* 결제 이력 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm text-sm">
        <h2 className="font-semibold">결제 이력</h2>
        <div className="mt-2 space-y-2">
          {data.payments.length === 0 && <p className="text-xs text-gray-400">결제 내역 없음 (0원 결제)</p>}
          {data.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <div>
                <p>{PAYMENT_KIND_LABEL[p.kind]}</p>
                <p className="text-xs text-gray-400">
                  카드 ****{p.cardLast4} · {p.approvedAt ? fmtDateTime(p.approvedAt) : '-'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{krw(p.amountKrw)}</p>
                <p className={`text-xs ${p.status === 'REFUNDED' ? 'text-red-400' : 'text-gray-400'}`}>
                  {PAYMENT_STATUS_LABEL[p.status]}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold' : ''}`}>
      <span className={bold ? '' : 'text-gray-500'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
