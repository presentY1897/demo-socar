export type InsuranceTier = 'LIGHT' | 'STANDARD' | 'FULL';

export interface PlanRates {
  baseHourlyKrw: number; // 주중 시간당 대여요금
  weekendHourlyKrw: number; // 주말(토·일, KST) 시간당 대여요금
  perKmKrw: number; // km당 주행요금
  insuranceLightKrw: number; // 시간당 보험료
  insuranceStandardKrw: number;
  insuranceFullKrw: number;
}

export interface QuoteInput {
  plan: PlanRates;
  startAt: Date;
  endAt: Date;
  insurance: InsuranceTier;
  couponDiscountKrw?: number;
  /** 사용 가능한 크레딧 잔액 (useCredit=true일 때 총액 한도 내에서 차감) */
  creditBalanceKrw?: number;
  useCredit?: boolean;
}

export interface QuoteBreakdown {
  slotCount: number; // 30분 슬롯 수
  rentalFeeKrw: number;
  insuranceFeeKrw: number;
  discountKrw: number; // 쿠폰 할인
  creditUsedKrw: number;
  totalUpfrontKrw: number; // 선결제 금액
}

export interface SettlementInput {
  plan: Pick<PlanRates, 'perKmKrw'>;
  distanceKm: number;
  lateMinutes: number;
}

export interface SettlementBreakdown {
  driveFeeKrw: number;
  lateFeeKrw: number;
  totalKrw: number;
}
