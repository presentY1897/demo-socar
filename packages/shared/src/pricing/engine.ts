/**
 * 요금 엔진 — 순수 함수.
 * 모든 시간 판정은 KST(UTC+9) 기준. 저장은 UTC, 요금 계산 시에만 KST로 해석한다.
 *
 * 실제 서비스 정책을 따른 부분:
 *  - 예약은 최소 30분부터 10분 단위, 최대 28일
 *  - 선결제 = 대여요금 + 면책상품 (+ 편도 수수료), 후불 = 주행요금
 *  - 주행요금은 30km까지 면제, 전기차는 전면 무료
 */
import type {
  InsuranceTier,
  PlanRates,
  QuoteBreakdown,
  QuoteInput,
  SettlementBreakdown,
  SettlementInput,
} from './types';

export const SLOT_MS = 10 * 60 * 1000; // 10분 단위
export const MIN_RENTAL_MS = 30 * 60 * 1000; // 최소 30분
export const MAX_RENTAL_MS = 28 * 24 * 3600 * 1000; // 최대 28일
export const FREE_DRIVE_KM = 30; // 주행요금 면제 구간 (내연/하이브리드)
export const LATE_FEE_PER_MIN_KRW = 200;
export const ONEWAY_FEE_PER_KM_KRW = 500; // 편도 수수료 km당 (모의 단가)
export const ONEWAY_FEE_MIN_KRW = 5000;
const KST_OFFSET_MS = 9 * 3600 * 1000;
const SLOTS_PER_HOUR = 6;

function isWeekendKst(d: Date): boolean {
  const day = new Date(d.getTime() + KST_OFFSET_MS).getUTCDay();
  return day === 0 || day === 6;
}

function insuranceHourly(plan: PlanRates, tier: InsuranceTier): number {
  switch (tier) {
    case 'LIGHT':
      return plan.insuranceLightKrw;
    case 'STANDARD':
      return plan.insuranceStandardKrw;
    case 'FULL':
      return plan.insuranceFullKrw;
  }
}

/** 대여 구간이 유효한 10분 슬롯 정렬인지 검사 */
export function validateSlotRange(startAt: Date, endAt: Date): string | null {
  if (startAt.getTime() >= endAt.getTime()) return '반납 시각은 시작 시각 이후여야 합니다';
  if (startAt.getTime() % SLOT_MS !== 0 || endAt.getTime() % SLOT_MS !== 0) {
    return '예약은 10분 단위로만 가능합니다';
  }
  const duration = endAt.getTime() - startAt.getTime();
  if (duration < MIN_RENTAL_MS) return '최소 대여 시간은 30분입니다';
  if (duration > MAX_RENTAL_MS) return '최대 대여 시간은 28일입니다';
  return null;
}

/**
 * 선결제 견적: 대여요금(슬롯별 주중/주말 단가) + 면책상품 + 편도 수수료 − 쿠폰 − 크레딧.
 * 할인은 [쿠폰 → 크레딧] 순서로 적용하고 0 아래로 내려가지 않는다.
 */
export function quote(input: QuoteInput): QuoteBreakdown {
  const { plan, startAt, endAt, insurance } = input;

  let rentalFee = 0;
  let slotCount = 0;
  for (let t = startAt.getTime(); t < endAt.getTime(); t += SLOT_MS) {
    const hourly = isWeekendKst(new Date(t)) ? plan.weekendHourlyKrw : plan.baseHourlyKrw;
    rentalFee += hourly / SLOTS_PER_HOUR;
    slotCount += 1;
  }
  rentalFee = Math.round(rentalFee);

  const insuranceFee = Math.round((insuranceHourly(plan, insurance) * slotCount) / SLOTS_PER_HOUR);
  const onewayFeeKrw = Math.max(0, Math.round(input.onewayFeeKrw ?? 0));

  const grossTotal = rentalFee + insuranceFee + onewayFeeKrw;
  const discount = Math.min(input.couponDiscountKrw ?? 0, grossTotal);
  const afterCoupon = grossTotal - discount;
  const creditUsed = input.useCredit
    ? Math.min(Math.max(input.creditBalanceKrw ?? 0, 0), afterCoupon)
    : 0;

  return {
    slotCount,
    rentalFeeKrw: rentalFee,
    insuranceFeeKrw: insuranceFee,
    onewayFeeKrw,
    discountKrw: discount,
    creditUsedKrw: creditUsed,
    totalUpfrontKrw: grossTotal - discount - creditUsed,
  };
}

/** 편도 수수료: 출발↔반납 존 직선거리 기반 (100원 단위 반올림, 최소 5,000원) */
export function onewayFee(distanceMeters: number): number {
  const raw = (distanceMeters / 1000) * ONEWAY_FEE_PER_KM_KRW;
  return Math.max(ONEWAY_FEE_MIN_KRW, Math.round(raw / 100) * 100);
}

/** 반납 후 정산: 주행요금(30km 면제, EV 무료) + 지연 반납 페널티 */
export function settle(input: SettlementInput): SettlementBreakdown {
  const chargeableKm =
    input.fuel === 'EV' ? 0 : Math.max(0, Math.max(input.distanceKm, 0) - FREE_DRIVE_KM);
  const driveFee = Math.round(chargeableKm * input.plan.perKmKrw);
  const lateFee = Math.max(input.lateMinutes, 0) * LATE_FEE_PER_MIN_KRW;
  return { driveFeeKrw: driveFee, lateFeeKrw: lateFee, totalKrw: driveFee + lateFee };
}
