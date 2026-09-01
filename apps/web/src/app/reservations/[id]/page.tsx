'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import dayjs from 'dayjs';
import type { RentalUsageRes } from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { fmtDateTime, INSURANCE_META, krw, RESERVATION_STATUS_LABEL } from '@/lib/format';
import { fromParts, TIMES_10MIN, toDatePart, toTimePart } from '@/lib/timerange';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { ConditionReportForm, ConditionReportSummary } from '@/components/ConditionReportForm';
import { IncidentForm } from '@/components/IncidentForm';
import { SmartKeyPanel } from '@/components/SmartKeyPanel';

interface Detail {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  insurance: 'LIGHT' | 'STANDARD' | 'FULL';
  rentalFeeKrw: number;
  insuranceFeeKrw: number;
  onewayFeeKrw: number;
  deliveryFeeKrw: number;
  deliveryLabel: string | null;
  discountKrw: number;
  creditUsedKrw: number;
  totalUpfrontKrw: number;
  vehicle: {
    modelName: string;
    plateNo: string;
    fuel: string;
    zone: { name: string; address: string };
    plan: { perKmKrw: number };
  };
  returnZone: { name: string } | null;
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
  UPFRONT: '대여요금 결제',
  DRIVE_SETTLEMENT: '주행요금 정산',
  PENALTY: '페널티',
};
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CAPTURED: '결제 완료',
  REFUNDED: '환불됨',
  PENDING: '대기',
  FAILED: '실패',
};

type StepState = 'todo' | 'current' | 'done';

export default function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, mutate } = useSWR<Detail>(`/reservations/${id}`, swrFetcher, {
    refreshInterval: 10000,
  });
  // 이용 단계(체크인/아웃)는 대여가 생긴 뒤에만 의미가 있다
  const rentalId = data?.rental?.id ?? null;
  const { data: usage, mutate: mutateUsage } = useSWR<RentalUsageRes>(
    rentalId ? `/rentals/${rentalId}/usage` : null,
    swrFetcher,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModify, setShowModify] = useState(false);
  const [modifyRange, setModifyRange] = useState<{ startAt: string; endAt: string } | null>(null);
  const [showExtend, setShowExtend] = useState(false);
  const [extendEnd, setExtendEnd] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await Promise.all([mutate(), mutateUsage()]);
      setShowModify(false);
      setShowExtend(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '요청에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  /** 폼이 스스로 에러를 보여주도록 실패를 그대로 던진다 */
  async function submitReport(path: string, body: unknown) {
    await api(path, { method: 'POST', body });
    await Promise.all([mutate(), mutateUsage()]);
  }

  if (!data) return <p className="py-16 text-center text-sm text-gray-400">불러오는 중...</p>;

  const canStart =
    data.status === 'CONFIRMED' &&
    dayjs().isAfter(dayjs(data.startAt).subtract(10, 'minute')) &&
    dayjs().isBefore(dayjs(data.endAt));
  const beforeStart = data.status === 'CONFIRMED' && dayjs().isBefore(dayjs(data.startAt));

  const rental = data.rental;
  const checkIn = usage?.checkIn ?? null;
  const checkOut = usage?.checkOut ?? null;
  const driving = rental?.status === 'IN_USE';

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
          {data.deliveryLabel ? (
            <span className="text-indigo-500">🚚 부름 수령: {data.deliveryLabel} (같은 자리 회수)</span>
          ) : (
            <>
              {data.vehicle.zone.name}
              {data.returnZone ? (
                <span className="text-indigo-500"> → {data.returnZone.name} (편도)</span>
              ) : (
                ' (왕복)'
              )}
            </>
          )}
          {' · '}
          {INSURANCE_META[data.insurance].label}
        </p>
      </div>

      {/* 이용 단계 — 대여가 시작되면 체크인 → 스마트키 → 이용 → 체크아웃 → 반납 순서로 진행된다 */}
      {rental && (
        <div className="mt-4 space-y-2">
          <Step
            n={1}
            title="체크인 — 차량 상태 촬영"
            state={checkIn ? 'done' : 'current'}
            summary={checkIn ? `사진 ${checkIn.photos.length}장` : '스마트키를 열려면 먼저 제출하세요'}
          >
            {checkIn ? (
              <ConditionReportSummary report={checkIn} />
            ) : (
              <ConditionReportForm
                phase="CHECK_IN"
                onSubmit={(dto) => submitReport(`/rentals/${rental.id}/check-in`, dto)}
              />
            )}
          </Step>

          <Step
            n={2}
            title="스마트키 · 차량 매뉴얼"
            state={checkOut ? 'done' : checkIn ? 'current' : 'todo'}
            summary={checkIn ? undefined : '체크인 후 사용할 수 있어요'}
          >
            {/* M1-6: 차종별 매뉴얼 링크 자리 */}
            {usage?.smartKey ? (
              <SmartKeyPanel rentalId={rental.id} state={usage.smartKey} />
            ) : (
              <p className="text-xs text-gray-400">차량 상태를 불러오는 중이에요</p>
            )}
          </Step>

          <Step
            n={3}
            title="이용 중"
            state={driving ? (checkIn ? 'current' : 'todo') : 'done'}
            summary={`반납 예정 ${fmtDateTime(data.endAt)}`}
          >
            <p className="text-sm text-gray-600">
              {fmtDateTime(rental.startedAt)}에 시작했어요
            </p>
            {driving && (
              <>
                <button
                  onClick={() => {
                    setExtendEnd(dayjs(data.endAt).add(30, 'minute').toISOString());
                    setShowExtend((v) => !v);
                  }}
                  className="mt-2 w-full rounded-lg border border-sky-300 bg-white py-2 text-sm font-semibold text-sky-600"
                >
                  반납 연장
                </button>
                {showExtend && extendEnd && (
                  <div className="mt-2 rounded-lg bg-gray-50 p-3">
                    <p className="text-sm font-medium">새 반납 시각</p>
                    <div className="mt-2 flex gap-1.5">
                      <input
                        type="date"
                        aria-label="연장 날짜"
                        value={toDatePart(extendEnd)}
                        onChange={(e) => setExtendEnd(fromParts(e.target.value, toTimePart(extendEnd)))}
                        className="flex-1 rounded-md border border-gray-300 px-1.5 py-1 text-xs"
                      />
                      <select
                        aria-label="연장 시각"
                        value={toTimePart(extendEnd)}
                        onChange={(e) => setExtendEnd(fromParts(toDatePart(extendEnd), e.target.value))}
                        className="rounded-md border border-gray-300 px-1 py-1 text-xs tabular-nums"
                      >
                        {TIMES_10MIN.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          api(`/rentals/${rental.id}/extend`, {
                            method: 'POST',
                            body: { endAt: extendEnd, idempotencyKey: crypto.randomUUID() },
                          }),
                        )
                      }
                      className="mt-2 w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      연장하기 (연장분 요금 결제)
                    </button>
                  </div>
                )}
                <div className="mt-3 border-t border-dashed pt-3">
                  <IncidentForm rentalId={rental.id} />
                </div>
              </>
            )}
          </Step>

          <Step
            n={4}
            title="체크아웃 — 주차 위치 촬영"
            state={checkOut ? 'done' : checkIn ? 'current' : 'todo'}
            summary={checkOut ? (checkOut.parkingNote ?? undefined) : '반납하려면 먼저 제출하세요'}
          >
            {checkOut ? (
              <ConditionReportSummary report={checkOut} />
            ) : (
              <ConditionReportForm
                phase="CHECK_OUT"
                onSubmit={(dto) => submitReport(`/rentals/${rental.id}/check-out`, dto)}
              />
            )}
          </Step>

          <Step
            n={5}
            title="반납 · 정산"
            state={rental.status === 'COMPLETED' ? 'done' : checkOut ? 'current' : 'todo'}
            summary={
              rental.status === 'COMPLETED'
                ? `주행 ${rental.distanceKm ?? 0}km`
                : '체크아웃 후 반납할 수 있어요'
            }
          >
            {driving && (
              <>
                <button
                  disabled={busy}
                  onClick={() => act(() => api(`/rentals/${rental.id}/return`, { method: 'POST' }))}
                  className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy ? '정산 중...' : '반납하기'}
                </button>
                <p className="mt-2 text-[11px] text-gray-400">
                  주행거리와 요금은 반납 즉시 자동 정산돼요
                </p>
              </>
            )}
            {rental.status === 'RETURN_PENDING' && (
              <button
                disabled={busy}
                onClick={() => act(() => api(`/rentals/${rental.id}/settle`, { method: 'POST' }))}
                className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white"
              >
                정산 재시도
              </button>
            )}
            {rental.status === 'COMPLETED' && (
              <p className="text-sm text-gray-600">
                {rental.returnedAt ? `${fmtDateTime(rental.returnedAt)}에 반납 완료` : '반납 완료'}
                {rental.lateMinutes > 0 && ` · ${rental.lateMinutes}분 지연`}
              </p>
            )}
          </Step>
        </div>
      )}

      {/* 이용 전 액션 */}
      {(canStart || beforeStart) && (
        <div className="mt-4 space-y-2">
          {canStart && (
            <button
              disabled={busy}
              onClick={() => act(() => api('/rentals/start', { method: 'POST', body: { reservationId: data.id } }))}
              className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-white disabled:opacity-40"
            >
              🚗 이용 시작 — 체크인으로
            </button>
          )}
          {beforeStart && (
            <div className="flex gap-2">
              {!data.deliveryLabel && (
                <button
                  onClick={() => {
                    setModifyRange({ startAt: data.startAt, endAt: data.endAt });
                    setShowModify((v) => !v);
                  }}
                  className="flex-1 rounded-xl border border-sky-300 bg-white py-3 font-semibold text-sky-600"
                >
                  시간 변경
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => act(() => api(`/reservations/${data.id}/cancel`, { method: 'POST' }))}
                className="flex-1 rounded-xl border border-red-200 bg-white py-3 font-semibold text-red-500 disabled:opacity-40"
              >
                예약 취소
              </button>
            </div>
          )}
          {showModify && modifyRange && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <TimeRangePicker
                startAt={modifyRange.startAt}
                endAt={modifyRange.endAt}
                onChange={(startAt, endAt) => setModifyRange({ startAt, endAt })}
              />
              <p className="mt-2 text-[11px] text-gray-400">
                차액은 추가 결제되거나 크레딧으로 환급돼요
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  act(() =>
                    api(`/reservations/${data.id}`, {
                      method: 'PATCH',
                      body: { ...modifyRange, idempotencyKey: crypto.randomUUID() },
                    }),
                  )
                }
                className="mt-2 w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                이 시간으로 변경
              </button>
            </div>
          )}
        </div>
      )}
      {data.status === 'CONFIRMED' && !canStart && (
        <p className="mt-3 text-center text-xs text-gray-400">예약 시작 10분 전부터 이용할 수 있어요</p>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {/* 요금 내역 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm text-sm">
        <h2 className="font-semibold">요금 내역</h2>
        <div className="mt-2 space-y-1">
          <Row label="대여요금" value={krw(data.rentalFeeKrw)} />
          <Row label={`면책상품 (${INSURANCE_META[data.insurance].label})`} value={krw(data.insuranceFeeKrw)} />
          {data.onewayFeeKrw > 0 && <Row label="편도 수수료" value={krw(data.onewayFeeKrw)} />}
          {data.deliveryFeeKrw > 0 && <Row label="부름 요금" value={krw(data.deliveryFeeKrw)} />}
          {data.discountKrw > 0 && <Row label="쿠폰 할인" value={`-${krw(data.discountKrw)}`} />}
          {data.creditUsedKrw > 0 && <Row label="크레딧" value={`-${krw(data.creditUsedKrw)}`} />}
          <Row label="선결제 합계" value={krw(data.totalUpfrontKrw)} bold />
          {data.rental?.driveFeeKrw != null && (
            <>
              <div className="border-t border-dashed pt-1" />
              <Row
                label={`주행요금 (${data.rental.distanceKm}km${data.vehicle.fuel === 'EV' ? ', 전기차 무료' : ', 30km 무료'})`}
                value={krw(data.rental.driveFeeKrw)}
              />
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

/**
 * 단계 카드 — 현재 단계는 펼쳐서 강조하고, 끝난 단계는 접어서 요약만 남긴다.
 * 접힌 단계도 눌러서 다시 펼칠 수 있다 (제출한 사진을 다시 보려는 경우).
 */
function Step({
  n,
  title,
  state,
  summary,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  summary?: string;
  children: React.ReactNode;
}) {
  const [manual, setManual] = useState<boolean | null>(null);
  const expanded = state !== 'todo' && (manual ?? state === 'current');

  return (
    <section
      data-testid={`step-${n}`}
      data-state={state}
      className={`rounded-xl bg-white p-4 shadow-sm ${
        state === 'current' ? 'ring-2 ring-sky-400' : state === 'todo' ? 'opacity-50' : ''
      }`}
    >
      <button
        type="button"
        disabled={state === 'todo'}
        onClick={() => setManual(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            state === 'done' ? 'bg-green-100 text-green-700' : 'bg-sky-100 text-sky-700'
          }`}
        >
          {state === 'done' ? '✓' : n}
        </span>
        <span className="flex-1">
          <span className="text-sm font-semibold">{title}</span>
          {summary && <span className="ml-2 text-xs text-gray-400">{summary}</span>}
        </span>
      </button>
      {expanded && <div className="mt-3">{children}</div>}
    </section>
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
