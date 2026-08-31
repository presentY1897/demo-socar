/**
 * 요금 엔진 — 순수 함수.
 * 모든 시간 판정은 KST(UTC+9) 기준. 저장은 UTC, 요금 계산 시에만 KST로 해석한다.
 */
import type {
  InsuranceTier,
  PlanRates,
  QuoteBreakdown,
  QuoteInput,
  SettlementBreakdown,
  SettlementInput,
} from './types';

export const SLOT_MS = 30 * 60 * 1000;
export const LATE_FEE_PER_MIN_KRW = 200;
const KST_OFFSET_MS = 9 * 3600 * 1000;

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

/** 대여 구간이 유효한 30분 슬롯 정렬인지 검사 */
export function validateSlotRange(startAt: Date, endAt: Date): string | null {
  if (startAt.getTime() >= endAt.getTime()) return '종료 시각은 시작 시각 이후여야 합니다';
  if (startAt.getTime() % SLOT_MS !== 0 || endAt.getTime() % SLOT_MS !== 0) {
    return '예약은 30분 단위로만 가능합니다';
  }
  const hours = (endAt.getTime() - startAt.getTime()) / 3600000;
  if (hours < 0.5) return '최소 대여 시간은 30분입니다';
  if (hours > 72) return '최대 대여 시간은 72시간입니다';
  return null;
}

/**
 * 선결제 견적: 대여요금(슬롯별 주중/주말 단가) + 보험료 − 쿠폰 − 크레딧.
 * 할인은 [쿠폰 → 크레딧] 순서로 적용하고 총액 아래로 내려가지 않는다.
 */
export function quote(input: QuoteInput): QuoteBreakdown {
  const { plan, startAt, endAt, insurance } = input;

  let rentalFee = 0;
  let slotCount = 0;
  for (let t = startAt.getTime(); t < endAt.getTime(); t += SLOT_MS) {
    const hourly = isWeekendKst(new Date(t)) ? plan.weekendHourlyKrw : plan.baseHourlyKrw;
    rentalFee += hourly / 2;
    slotCount += 1;
  }
  rentalFee = Math.round(rentalFee);

  const hours = slotCount / 2;
  const insuranceFee = Math.round(insuranceHourly(plan, insurance) * hours);

  const grossTotal = rentalFee + insuranceFee;
  const discount = Math.min(input.couponDiscountKrw ?? 0, grossTotal);
  const afterCoupon = grossTotal - discount;
  const creditUsed = input.useCredit
    ? Math.min(Math.max(input.creditBalanceKrw ?? 0, 0), afterCoupon)
    : 0;

  return {
    slotCount,
    rentalFeeKrw: rentalFee,
    insuranceFeeKrw: insuranceFee,
    discountKrw: discount,
    creditUsedKrw: creditUsed,
    totalUpfrontKrw: grossTotal - discount - creditUsed,
  };
}

/** 반납 후 정산: 주행요금 + 지연 반납 페널티 */
export function settle(input: SettlementInput): SettlementBreakdown {
  const driveFee = Math.round(Math.max(input.distanceKm, 0) * input.plan.perKmKrw);
  const lateFee = Math.max(input.lateMinutes, 0) * LATE_FEE_PER_MIN_KRW;
  return { driveFeeKrw: driveFee, lateFeeKrw: lateFee, totalKrw: driveFee + lateFee };
}
