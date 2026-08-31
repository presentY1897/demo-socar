'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import dayjs from 'dayjs';
import type { QuoteBreakdown } from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { useSession } from '@/lib/session';
import { INSURANCE_LABEL, krw, todayKst } from '@/lib/format';

interface VehicleDetail {
  id: string;
  modelName: string;
  plateNo: string;
  seats: number;
  fuel: string;
  zone: { name: string; address: string };
  plan: {
    name: string;
    baseHourlyKrw: number;
    weekendHourlyKrw: number;
    perKmKrw: number;
    insuranceLightKrw: number;
    insuranceStandardKrw: number;
    insuranceFullKrw: number;
  };
}
interface Availability {
  date: string;
  busy: { startAt: string; endAt: string }[];
}
interface Coupon {
  id: string;
  name: string;
  discountKrw: number;
}

/** 하루 48개 30분 슬롯 (KST) */
function slotTimes(date: string) {
  const base = dayjs(`${date}T00:00:00+09:00`);
  return Array.from({ length: 48 }, (_, i) => base.add(i * 30, 'minute'));
}

export default function BookPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = use(params);
  const router = useRouter();
  const { user, ready } = useSession();

  const [date, setDate] = useState(todayKst());
  const [startIdx, setStartIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null); // 마지막 선택 슬롯 (포함)
  const [insurance, setInsurance] = useState<'LIGHT' | 'STANDARD' | 'FULL'>('STANDARD');
  const [couponId, setCouponId] = useState<string>('');
  const [useCredit, setUseCredit] = useState(false);
  const [cardLast4, setCardLast4] = useState('4242');
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const { data: vehicle } = useSWR<VehicleDetail>(`/vehicles/${vehicleId}`, swrFetcher);
  const { data: avail } = useSWR<Availability>(
    `/vehicles/${vehicleId}/availability?date=${date}`,
    swrFetcher,
    { refreshInterval: 15000 },
  );
  const { data: coupons } = useSWR<Coupon[]>(user ? '/me/coupons' : null, swrFetcher);
  const { data: credit } = useSWR<{ balanceKrw: number }>(user ? '/me/credit' : null, swrFetcher);

  const slots = useMemo(() => slotTimes(date), [date]);
  const busyRanges = useMemo(
    () => (avail?.busy ?? []).map((b) => [dayjs(b.startAt), dayjs(b.endAt)] as const),
    [avail],
  );

  const isDisabled = (i: number) => {
    const t = slots[i];
    if (t.isBefore(dayjs())) return true;
    const tEnd = t.add(30, 'minute');
    return busyRanges.some(([s, e]) => t.isBefore(e) && tEnd.isAfter(s));
  };

  const selectSlot = (i: number) => {
    setError(null);
    if (startIdx === null || endIdx !== null) {
      setStartIdx(i);
      setEndIdx(null);
      return;
    }
    if (i < startIdx) {
      setStartIdx(i);
      return;
    }
    // 시작~끝 사이에 비활성 슬롯이 있으면 선택 불가
    for (let k = startIdx; k <= i; k++) {
      if (isDisabled(k)) {
        setError('선택 구간에 이미 예약된 시간이 있어요');
        return;
      }
    }
    setEndIdx(i);
  };

  const startAt = startIdx !== null ? slots[startIdx].toISOString() : null;
  const endAt = endIdx !== null ? slots[endIdx].add(30, 'minute').toISOString() : null;

  useEffect(() => {
    setQuote(null);
    if (!user || !startAt || !endAt) return;
    let stale = false;
    api<QuoteBreakdown>('/reservations/quote', {
      method: 'POST',
      body: {
        vehicleId,
        startAt,
        endAt,
        insurance,
        couponId: couponId || undefined,
        useCredit,
      },
    })
      .then((q) => !stale && setQuote(q))
      .catch((e) => !stale && setError(e instanceof ApiError ? e.message : '견적 조회 실패'));
    return () => {
      stale = true;
    };
  }, [user, vehicleId, startAt, endAt, insurance, couponId, useCredit]);

  async function submit() {
    if (!startAt || !endAt) return;
    setSubmitting(true);
    setError(null);
    try {
      const resv = await api<{ id: string }>('/reservations', {
        method: 'POST',
        body: {
          vehicleId,
          startAt,
          endAt,
          insurance,
          couponId: couponId || undefined,
          useCredit,
          cardLast4,
          idempotencyKey: idempotencyKey.current,
        },
      });
      router.push(`/reservations/${resv.id}`);
    } catch (e) {
      // 실패(카드 거절/충돌) 후 재시도는 새로운 결제 시도로 본다
      idempotencyKey.current = crypto.randomUUID();
      setError(e instanceof ApiError ? e.message : '예약에 실패했습니다');
      setSubmitting(false);
    }
  }

  if (ready && !user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-gray-500">예약하려면 로그인이 필요해요</p>
        <button
          onClick={() => router.push('/login')}
          className="mt-4 rounded-lg bg-sky-500 px-6 py-2 text-sm font-semibold text-white"
        >
          로그인하러 가기
        </button>
      </div>
    );
  }

  const insuranceFee = (tier: 'LIGHT' | 'STANDARD' | 'FULL') =>
    vehicle
      ? {
          LIGHT: vehicle.plan.insuranceLightKrw,
          STANDARD: vehicle.plan.insuranceStandardKrw,
          FULL: vehicle.plan.insuranceFullKrw,
        }[tier]
      : 0;

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* 차량 정보 */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold">
          {vehicle?.modelName}
          <span className="ml-2 text-sm font-normal text-gray-400">{vehicle?.plateNo}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {vehicle?.zone.name} · {vehicle?.zone.address}
        </p>
        <p className="mt-1 text-sm">
          <span className="font-semibold text-sky-600">{krw(vehicle?.plan.baseHourlyKrw ?? 0)}/시간</span>
          <span className="ml-2 text-xs text-gray-400">
            주말 {krw(vehicle?.plan.weekendHourlyKrw ?? 0)} · 주행 {krw(vehicle?.plan.perKmKrw ?? 0)}/km
          </span>
        </p>
      </div>

      {/* 날짜 + 슬롯 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">이용 시간</h2>
          <input
            type="date"
            value={date}
            min={todayKst()}
            onChange={(e) => {
              setDate(e.target.value);
              setStartIdx(null);
              setEndIdx(null);
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <p className="mt-1 text-xs text-gray-400">시작 슬롯과 종료 슬롯을 차례로 탭하세요 (30분 단위)</p>
        <div className="mt-3 grid grid-cols-6 gap-1">
          {slots.map((t, i) => {
            const disabled = isDisabled(i);
            const inRange =
              startIdx !== null && endIdx !== null && i >= startIdx && i <= endIdx;
            const isStart = i === startIdx;
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => selectSlot(i)}
                className={`rounded py-1 text-[11px] tabular-nums ${
                  disabled
                    ? 'bg-gray-100 text-gray-300 line-through'
                    : inRange || isStart
                      ? 'bg-sky-500 font-semibold text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-sky-100'
                }`}
              >
                {t.format('HH:mm')}
              </button>
            );
          })}
        </div>
      </div>

      {/* 보험 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">차량손해면책 상품</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['LIGHT', 'STANDARD', 'FULL'] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => setInsurance(tier)}
              className={`rounded-lg border px-2 py-2 text-sm ${
                insurance === tier
                  ? 'border-sky-500 bg-sky-50 font-semibold text-sky-600'
                  : 'border-gray-200 text-gray-500'
              }`}
            >
              {INSURANCE_LABEL[tier]}
              <span className="block text-[11px] font-normal text-gray-400">
                {krw(insuranceFee(tier))}/시간
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 할인 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">할인</h2>
        <select
          value={couponId}
          onChange={(e) => setCouponId(e.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">쿠폰 선택 안 함</option>
          {(coupons ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (-{krw(c.discountKrw)})
            </option>
          ))}
        </select>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useCredit}
            onChange={(e) => setUseCredit(e.target.checked)}
          />
          크레딧 사용 (잔액 {krw(credit?.balanceKrw ?? 0)})
        </label>
      </div>

      {/* 결제 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">결제 수단 (모의)</h2>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-gray-400">카드 끝 4자리</span>
          <input
            value={cardLast4}
            onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-center tabular-nums"
          />
          <span className="text-[11px] text-gray-400">0000 입력 시 승인 거절 데모</span>
        </div>

        {quote && (
          <div className="mt-4 space-y-1 border-t border-dashed pt-3 text-sm">
            <Row label={`대여요금 (${quote.slotCount / 2}시간)`} value={krw(quote.rentalFeeKrw)} />
            <Row label={`면책상품 (${INSURANCE_LABEL[insurance]})`} value={krw(quote.insuranceFeeKrw)} />
            {quote.discountKrw > 0 && <Row label="쿠폰 할인" value={`-${krw(quote.discountKrw)}`} red />}
            {quote.creditUsedKrw > 0 && <Row label="크레딧" value={`-${krw(quote.creditUsedKrw)}`} red />}
            <div className="flex items-center justify-between pt-1 text-base font-bold">
              <span>결제 금액</span>
              <span className="text-sky-600">{krw(quote.totalUpfrontKrw)}</span>
            </div>
            <p className="text-[11px] text-gray-400">주행요금은 반납 후 주행거리에 따라 별도 정산돼요</p>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <button
        disabled={!quote || submitting}
        onClick={submit}
        className="mt-4 w-full rounded-xl bg-sky-500 py-3 font-semibold text-white disabled:opacity-40"
      >
        {submitting ? '결제 중...' : quote ? `${krw(quote.totalUpfrontKrw)} 결제하고 예약` : '시간을 선택하세요'}
      </button>
    </div>
  );
}

function Row({ label, value, red }: { label: string; value: string; red?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={red ? 'text-red-500' : ''}>{value}</span>
    </div>
  );
}
