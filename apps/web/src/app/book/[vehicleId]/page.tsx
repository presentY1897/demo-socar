'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import type { QuoteBreakdown } from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { useSession } from '@/lib/session';
import { fmtDateTime, INSURANCE_META, krw } from '@/lib/format';
import { defaultRange, durationLabel } from '@/lib/timerange';

const DeliveryMapPicker = dynamic(() => import('@/components/DeliveryMapPicker'), {
  ssr: false,
  loading: () => <div className="flex h-48 items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-400">지도 로딩...</div>,
});

interface VehicleDetail {
  id: string;
  modelName: string;
  plateNo: string;
  seats: number;
  fuel: string;
  zone: { id: string; name: string; address: string; region: string; lat: number; lng: number };
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
interface Coupon {
  id: string;
  name: string;
  discountKrw: number;
}
interface ReturnZone {
  id: string;
  name: string;
}

function BookPageInner({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user, ready } = useSession();

  const fallback = defaultRange();
  const startAt = params.get('startAt') ?? fallback.startAt;
  const endAt = params.get('endAt') ?? fallback.endAt;
  // 홈의 '부름으로 가져와 이용' 후보에서 진입하면 부름 모드 + 검색 존 위치가 프리셋된다
  const presetLat = params.get('dlat');
  const presetLng = params.get('dlng');
  const presetLabel = params.get('dlabel');
  const hasPreset = presetLat !== null && presetLng !== null;

  const [insurance, setInsurance] = useState<'LIGHT' | 'STANDARD' | 'FULL'>('STANDARD');
  const [returnZoneId, setReturnZoneId] = useState('');
  const [pickup, setPickup] = useState<'zone' | 'delivery'>(hasPreset ? 'delivery' : 'zone');
  const [deliveryPos, setDeliveryPos] = useState<[number, number] | null>(
    hasPreset ? [Number(presetLat), Number(presetLng)] : null,
  );
  const [deliveryLabel, setDeliveryLabel] = useState(presetLabel ?? '');
  const [couponId, setCouponId] = useState('');
  const [useCredit, setUseCredit] = useState(false);
  const [cardLast4, setCardLast4] = useState('4242');
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const { data: vehicle } = useSWR<VehicleDetail>(`/vehicles/${vehicleId}`, swrFetcher);
  const { data: returnZones } = useSWR<ReturnZone[]>(
    vehicle ? `/zones/${vehicle.zone.id}/return-zones` : null,
    swrFetcher,
  );
  const { data: coupons } = useSWR<Coupon[]>(user ? '/me/coupons' : null, swrFetcher);
  const { data: credit } = useSWR<{ balanceKrw: number }>(user ? '/me/credit' : null, swrFetcher);

  const delivery =
    pickup === 'delivery' && deliveryPos && deliveryLabel.trim()
      ? { lat: deliveryPos[0], lng: deliveryPos[1], label: deliveryLabel.trim() }
      : undefined;
  const deliveryIncomplete = pickup === 'delivery' && !delivery;

  useEffect(() => {
    setQuote(null);
    setError(null);
    if (!user || deliveryIncomplete) return;
    let stale = false;
    api<QuoteBreakdown>('/reservations/quote', {
      method: 'POST',
      body: {
        vehicleId,
        startAt,
        endAt,
        insurance,
        returnZoneId: returnZoneId || undefined,
        delivery,
        couponId: couponId || undefined,
        useCredit,
      },
    })
      .then((q) => !stale && setQuote(q))
      .catch((e) => !stale && setError(e instanceof ApiError ? e.message : '견적 조회 실패'));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vehicleId, startAt, endAt, insurance, returnZoneId, couponId, useCredit, pickup, deliveryPos, deliveryLabel]);

  async function submit() {
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
          returnZoneId: returnZoneId || undefined,
          delivery,
          couponId: couponId || undefined,
          useCredit,
          cardLast4,
          idempotencyKey: idempotencyKey.current,
        },
      });
      router.push(`/reservations/${resv.id}`);
    } catch (e) {
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

  const insuranceHourly = {
    LIGHT: vehicle?.plan.insuranceLightKrw ?? 0,
    STANDARD: vehicle?.plan.insuranceStandardKrw ?? 0,
    FULL: vehicle?.plan.insuranceFullKrw ?? 0,
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* 이용 시간 (홈에서 확정) */}
      <div className="flex items-center justify-between rounded-xl bg-sky-50 px-4 py-3">
        <div>
          <p className="text-[11px] text-sky-600">이용 시간 ({durationLabel(startAt, endAt)})</p>
          <p className="text-sm font-semibold">
            {fmtDateTime(startAt)} → {fmtDateTime(endAt)}
          </p>
        </div>
        <Link href="/" className="text-xs text-sky-500 underline">변경</Link>
      </div>

      {/* 차량 정보 */}
      <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold">
          {vehicle?.modelName}
          <span className="ml-2 text-sm font-normal text-gray-400">{vehicle?.plateNo}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {vehicle?.zone.name} · {vehicle?.zone.address}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          주행요금 {vehicle?.fuel === 'EV' ? '무료 (전기차)' : `30km 초과분 ${krw(vehicle?.plan.perKmKrw ?? 0)}/km`} · 반납 후 자동 정산
        </p>
        <Link
          href={`/vehicles/${vehicleId}/manual`}
          className="mt-2 inline-block text-xs text-sky-500 underline"
        >
          📖 이 차종 매뉴얼 보기
        </Link>
      </div>

      {/* 수령 방법: 존 픽업 / 부름 */}
      <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">수령 방법</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => setPickup('zone')}
            className={`rounded-lg border px-3 py-2 text-sm ${
              pickup === 'zone' ? 'border-sky-500 bg-sky-50 font-semibold text-sky-600' : 'border-gray-200 text-gray-500'
            }`}
          >
            존에서 픽업
          </button>
          <button
            onClick={() => {
              setPickup('delivery');
              setReturnZoneId(''); // 부름과 편도는 함께 쓸 수 없다
              if (!deliveryPos && vehicle) setDeliveryPos([vehicle.zone.lat + 0.002, vehicle.zone.lng + 0.002]);
            }}
            className={`rounded-lg border px-3 py-2 text-sm ${
              pickup === 'delivery' ? 'border-sky-500 bg-sky-50 font-semibold text-sky-600' : 'border-gray-200 text-gray-500'
            }`}
          >
            부름으로 받기 🚚
          </button>
        </div>

        {pickup === 'delivery' && vehicle && (
          <div className="mt-3">
            <p className="text-xs text-gray-500">지도를 탭해서 받을 위치를 지정하세요 (존 반경 5km)</p>
            <div className="mt-2">
              <DeliveryMapPicker
                center={[vehicle.zone.lat, vehicle.zone.lng]}
                position={deliveryPos}
                onPick={(lat, lng) => setDeliveryPos([lat, lng])}
              />
            </div>
            <input
              value={deliveryLabel}
              onChange={(e) => setDeliveryLabel(e.target.value)}
              placeholder="장소 이름 (예: 회사 정문 앞)"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1.5 text-[11px] text-gray-400">
              탁송 시간이 필요해 최소 1시간 이후 시각부터 예약할 수 있어요 · 이용 후 같은 자리에서 회수해요
            </p>
            {quote && quote.deliveryFeeKrw > 0 && (
              <p className="mt-1 text-xs text-gray-500">부름 요금 {krw(quote.deliveryFeeKrw)}가 포함돼요</p>
            )}
          </div>
        )}
      </div>

      {/* 반납 존 (편도) — 부름과 배타 */}
      {pickup === 'zone' && (
        <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">반납 장소</h2>
          <select
            value={returnZoneId}
            onChange={(e) => setReturnZoneId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">빌린 곳에 반납 (왕복)</option>
            {(returnZones ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} — 편도
              </option>
            ))}
          </select>
          {returnZoneId && quote && (
            <p className="mt-1.5 text-xs text-gray-400">편도 수수료 {krw(quote.onewayFeeKrw)}가 포함돼요</p>
          )}
        </div>
      )}

      {/* 면책상품 */}
      <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">차량손해면책 상품</h2>
        <div className="mt-2 space-y-2">
          {(['FULL', 'STANDARD', 'LIGHT'] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => setInsurance(tier)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left ${
                insurance === tier
                  ? 'border-sky-500 bg-sky-50'
                  : 'border-gray-200'
              }`}
            >
              <div>
                <p className={`text-sm font-semibold ${insurance === tier ? 'text-sky-600' : ''}`}>
                  {INSURANCE_META[tier].label}
                </p>
                <p className="text-[11px] text-gray-400">{INSURANCE_META[tier].description}</p>
              </div>
              <span className="text-xs text-gray-500">{krw(insuranceHourly[tier])}/시간</span>
            </button>
          ))}
        </div>
      </div>

      {/* 할인 */}
      <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
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
          <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />
          크레딧 사용 (잔액 {krw(credit?.balanceKrw ?? 0)})
        </label>
      </div>

      {/* 결제 */}
      <div className="mt-3 rounded-xl bg-white p-4 shadow-sm">
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
            <Row label={`대여요금 (${durationLabel(startAt, endAt)})`} value={krw(quote.rentalFeeKrw)} />
            <Row label={`면책상품 (${INSURANCE_META[insurance].label})`} value={krw(quote.insuranceFeeKrw)} />
            {quote.onewayFeeKrw > 0 && <Row label="편도 수수료" value={krw(quote.onewayFeeKrw)} />}
            {quote.deliveryFeeKrw > 0 && <Row label="부름 요금" value={krw(quote.deliveryFeeKrw)} />}
            {quote.discountKrw > 0 && <Row label="쿠폰 할인" value={`-${krw(quote.discountKrw)}`} red />}
            {quote.creditUsedKrw > 0 && <Row label="크레딧" value={`-${krw(quote.creditUsedKrw)}`} red />}
            <div className="flex items-center justify-between pt-1 text-base font-bold">
              <span>결제 금액</span>
              <span className="text-sky-600">{krw(quote.totalUpfrontKrw)}</span>
            </div>
            <p className="text-[11px] text-gray-400">주행요금은 반납 후 자동 정산돼요 (30km 무료, 전기차 전면 무료)</p>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <button
        disabled={!quote || submitting || deliveryIncomplete}
        onClick={submit}
        className="mt-4 w-full rounded-xl bg-sky-500 py-3 font-semibold text-white disabled:opacity-40"
      >
        {submitting
          ? '결제 중...'
          : deliveryIncomplete
            ? '부름 위치와 장소 이름을 입력하세요'
            : quote
              ? `${krw(quote.totalUpfrontKrw)} 결제하고 예약`
              : '견적 계산 중...'}
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

/** 라우트 파라미터는 `useParams()`로 읽는다 (src/test/README.md — 동적 라우트 화면 규약) */
export default function BookPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-gray-400">불러오는 중...</p>}>
      <BookPageInner vehicleId={vehicleId} />
    </Suspense>
  );
}
