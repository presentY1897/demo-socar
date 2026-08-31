export type InsuranceTier = 'LIGHT' | 'STANDARD' | 'FULL';
export type FuelKind = 'EV' | 'GASOLINE' | 'HYBRID';

export interface PlanRates {
  baseHourlyKrw: number; // 주중 시간당 대여요금
  weekendHourlyKrw: number; // 주말(토·일, KST) 시간당 대여요금
  perKmKrw: number; // km당 주행요금 (면제 구간 초과분)
  insuranceLightKrw: number; // 시간당 면책상품 요금
  insuranceStandardKrw: number;
  insuranceFullKrw: number;
}

export interface QuoteInput {
  plan: PlanRates;
  startAt: Date;
  endAt: Date;
  insurance: InsuranceTier;
  /** 편도 수수료 (편도 예약 시, onewayFee()로 계산) */
  onewayFeeKrw?: number;
  /** 부름 요금 (부름 수령 시, deliveryFee()로 계산) */
  deliveryFeeKrw?: number;
  couponDiscountKrw?: number;
  /** 사용 가능한 크레딧 잔액 (useCredit=true일 때 총액 한도 내에서 차감) */
  creditBalanceKrw?: number;
  useCredit?: boolean;
}

export interface QuoteBreakdown {
  slotCount: number; // 10분 슬롯 수
  rentalFeeKrw: number;
  insuranceFeeKrw: number;
  onewayFeeKrw: number;
  deliveryFeeKrw: number;
  discountKrw: number; // 쿠폰 할인
  creditUsedKrw: number;
  totalUpfrontKrw: number; // 선결제 금액
}

export interface SettlementInput {
  plan: Pick<PlanRates, 'perKmKrw'>;
  fuel: FuelKind;
  distanceKm: number;
  lateMinutes: number;
}

export interface SettlementBreakdown {
  driveFeeKrw: number;
  lateFeeKrw: number;
  totalKrw: number;
}
