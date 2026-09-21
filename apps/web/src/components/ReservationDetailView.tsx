'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import dayjs from 'dayjs';
import type { RentalUsageRes, ReservationStatusValue } from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { fmtDateTime, INSURANCE_META, krw, RESERVATION_STATUS_LABEL } from '@/lib/format';
import { PROGRESS_STEPS, progressState, rentalStage, type ProgressKey } from '@/lib/rental-stage';
import { fromParts, TIMES_10MIN, toDatePart, toTimePart } from '@/lib/timerange';
import { ModifyReservationPanel } from '@/components/ModifyReservationPanel';
import { ConditionReportForm, ConditionReportSummary } from '@/components/ConditionReportForm';
import { IncidentForm } from '@/components/IncidentForm';
import { SmartKeyPanel } from '@/components/SmartKeyPanel';

interface Detail {
  id: string;
  vehicleId: string;
  startAt: string;
  endAt: string;
  status: ReservationStatusValue;
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
    zone: { id: string; name: string; address: string; lat: number; lng: number };
    plan: { perKmKrw: number };
  };
  returnZoneId: string | null;
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

interface Props {
  id: string;
  /** 홈에 얹혀 있을 때 — 뒤로 가기 대신 "다른 차량 찾기"로 지도에 나간다 */
  onBrowse?: () => void;
}

/**
 * 예약 한 건의 화면. 예약 상세(`/reservations/[id]`)와 이용 중의 홈이 같은 컴포넌트를 쓴다.
 *
 * 이용이 시작되면 **지금 단계 하나만** 그린다 (`lib/rental-stage.ts`):
 * 체크인 → 이용 중(스마트키) → 체크아웃 → 반납. 끝난 단계는 "기록 보기"로 접어 둔다.
 */
export function ReservationDetailView({ id, onBrowse }: Props) {
  const router = useRouter();
  const { data, mutate } = useSWR<Detail>(`/reservations/${id}`, swrFetcher, {
    refreshInterval: 10000,
  });
  // 이용 기록(체크인/아웃·스마트키)은 대여가 생긴 뒤에만 의미가 있다
  const rentalId = data?.rental?.id ?? null;
  const { data: usage, mutate: mutateUsage } = useSWR<RentalUsageRes>(
    rentalId ? `/rentals/${rentalId}/usage` : null,
    swrFetcher,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModify, setShowModify] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [extendEnd, setExtendEnd] = useState<string | null>(null);
  // 체크아웃 폼을 열었는지 — 서버 상태가 아니라 "반납 시작"을 누른 화면 안의 선택이다
  const [returning, setReturning] = useState(false);

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

  const stage = rentalStage(data, usage);
  const rental = data.rental;
  const checkIn = usage?.checkIn ?? null;
  const checkOut = usage?.checkOut ?? null;

  const canStart =
    stage === 'BEFORE_START' &&
    dayjs().isAfter(dayjs(data.startAt).subtract(10, 'minute')) &&
    dayjs().isBefore(dayjs(data.endAt));
  const beforeStart = stage === 'BEFORE_START' && dayjs().isBefore(dayjs(data.startAt));

  // 화면 단계 — 이용 중에 "반납 시작"을 누르면 체크아웃 폼만 보인다
  const view = stage === 'DRIVING' && returning ? 'CHECK_OUT' : stage;
  const progress: ProgressKey | 'DONE' | null =
    view === 'CHECK_IN' || view === 'DRIVING'
      ? view
      : view === 'CHECK_OUT' || view === 'RETURN'
        ? 'RETURN'
        : view === 'DONE'
          ? 'DONE'
          : null;
  const active = view === 'CHECK_IN' || view === 'DRIVING' || view === 'CHECK_OUT' || view === 'RETURN';

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {onBrowse ? (
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">
            {stage === 'DONE' ? '이용을 마쳤어요' : '이용 중인 차량'}
          </p>
          <button onClick={onBrowse} className="text-sm text-sky-600">
            🗺️ 다른 차량 찾기
          </button>
        </div>
      ) : (
        <button onClick={() => router.back()} className="text-sm text-gray-400">← 뒤로</button>
      )}

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
        {/* 매뉴얼은 단계와 무관하게 늘 닿는 자리에 둔다 — 차에 가기 전에 미리 읽는 사람도, 운전 중에 찾는 사람도 있다 */}
        {stage !== 'CANCELED' && (
          <Link
            href={`/vehicles/${data.vehicleId}/manual`}
            className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm hover:border-sky-400"
          >
            <span>📖 {data.vehicle.modelName} 매뉴얼 — 시동·충전·반납 전 확인</span>
            <span className="text-gray-300">›</span>
          </Link>
        )}
      </div>

      {progress && (
        <ol className="mt-4 flex items-center gap-1.5" aria-label="이용 단계">
          {PROGRESS_STEPS.map((s, i) => {
            const state = progressState(s.key, progress);
            return (
              <li
                key={s.key}
                data-testid={`progress-${s.key}`}
                data-state={state}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold ${
                  state === 'current'
                    ? 'bg-sky-500 text-white'
                    : state === 'done'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                <span>{state === 'done' ? '✓' : i + 1}</span>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}

      {/* 이용 단계 — 지금 단계의 화면 하나만 */}
      {rental && view && view !== 'CANCELED' && view !== 'BEFORE_START' && (
        <section data-testid="stage" data-stage={view} className="mt-3 space-y-3">
          {view === 'CHECK_IN' && (
            <Card title="체크인 — 차량 상태 촬영" hint="제출하면 스마트키가 열려요">
              <ConditionReportForm
                phase="CHECK_IN"
                onSubmit={(dto) => submitReport(`/rentals/${rental.id}/check-in`, dto)}
              />
            </Card>
          )}

          {view === 'DRIVING' && (
            <>
              <Card title="스마트키">
                {usage?.smartKey ? (
                  <SmartKeyPanel rentalId={rental.id} state={usage.smartKey} />
                ) : (
                  <p className="text-xs text-gray-400">차량 상태를 불러오는 중이에요</p>
                )}
              </Card>

              <Card title="이용 중" hint={`반납 예정 ${fmtDateTime(data.endAt)}`}>
                <p className="text-sm text-gray-600">{fmtDateTime(rental.startedAt)}에 시작했어요</p>
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
              </Card>

              <button
                onClick={() => setReturning(true)}
                className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white"
              >
                반납 시작 — 체크아웃으로
              </button>
            </>
          )}

          {view === 'CHECK_OUT' && (
            <Card title="체크아웃 — 주차 위치 촬영" hint="제출하면 반납할 수 있어요">
              <ConditionReportForm
                phase="CHECK_OUT"
                onSubmit={(dto) => submitReport(`/rentals/${rental.id}/check-out`, dto)}
              />
              <button
                onClick={() => setReturning(false)}
                className="mt-2 w-full py-1 text-xs text-gray-400"
              >
                ← 아직 더 탈게요 (이용 화면으로)
              </button>
            </Card>
          )}

          {view === 'RETURN' && (
            <>
              <Card title="반납 · 정산" hint={checkOut?.parkingNote ?? undefined}>
                {rental.status === 'RETURN_PENDING' ? (
                  <button
                    disabled={busy}
                    onClick={() => act(() => api(`/rentals/${rental.id}/settle`, { method: 'POST' }))}
                    className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white"
                  >
                    정산 재시도
                  </button>
                ) : (
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
              </Card>
              {/* 주차 사진을 찍고 나서 문을 잠그는 순서라, 반납 화면에도 키를 남겨 둔다 */}
              {rental.status === 'IN_USE' && usage?.smartKey && (
                <Card title="스마트키" hint="문을 잠그고 반납하세요">
                  <SmartKeyPanel rentalId={rental.id} state={usage.smartKey} />
                </Card>
              )}
            </>
          )}

          {view === 'DONE' && (
            <Card title="반납 완료" hint={`주행 ${rental.distanceKm ?? 0}km`}>
              <p className="text-sm text-gray-600">
                {rental.returnedAt ? `${fmtDateTime(rental.returnedAt)}에 반납 완료` : '반납 완료'}
                {rental.lateMinutes > 0 && ` · ${rental.lateMinutes}분 지연`}
              </p>
            </Card>
          )}

          {/* 끝난 단계는 화면에서 빼되, 제출한 사진은 다시 볼 수 있게 접어 둔다 */}
          {view !== 'CHECK_IN' && checkIn && (
            <Fold title="체크인 기록" summary={`사진 ${checkIn.photos.length}장`}>
              <ConditionReportSummary report={checkIn} />
            </Fold>
          )}
          {(view === 'RETURN' || view === 'DONE') && checkOut && (
            <Fold title="체크아웃 기록" summary={checkOut.parkingNote ?? undefined}>
              <ConditionReportSummary report={checkOut} />
            </Fold>
          )}
        </section>
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
                  onClick={() => setShowModify((v) => !v)}
                  className="flex-1 rounded-xl border border-sky-300 bg-white py-3 font-semibold text-sky-600"
                >
                  예약 변경
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
          {showModify && (
            <ModifyReservationPanel
              reservation={data}
              onDone={async () => {
                await Promise.all([mutate(), mutateUsage()]);
                setShowModify(false);
              }}
            />
          )}
        </div>
      )}
      {stage === 'BEFORE_START' && !canStart && (
        <p className="mt-3 text-center text-xs text-gray-400">예약 시작 10분 전부터 이용할 수 있어요</p>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {/* 요금·결제 — 차 앞에서는 볼 일이 드물어 이용 중에는 접어 둔다 */}
      {active ? (
        <div className="mt-4">
          <Fold title="요금 · 결제 내역" summary={`선결제 ${krw(data.totalUpfrontKrw)}`}>
            <Billing data={data} />
          </Fold>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
          <Billing data={data} />
        </div>
      )}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold">
        {title}
        {hint && <span className="ml-2 text-xs font-normal text-gray-400">{hint}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** 접어 둔 부가 정보 — 끝난 단계의 기록, 요금 내역 */
function Fold({ title, summary, children }: { title: string; summary?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm"
      >
        <span>
          <span className="font-medium text-gray-700">{title}</span>
          {summary && <span className="ml-2 text-xs text-gray-400">{summary}</span>}
        </span>
        <span className="text-gray-300">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Billing({ data }: { data: Detail }) {
  return (
    <div className="text-sm">
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

      <h2 className="mt-4 border-t border-gray-100 pt-3 font-semibold">결제 이력</h2>
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
