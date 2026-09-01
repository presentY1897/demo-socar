import type { OpsAccountingSummaryRes } from '@socar/shared';

/**
 * 월 손익 집계 — 순수 함수 (M3-3).
 *
 * 매출과 비용의 성격이 다르다는 게 이 계산의 핵심이다:
 *   매출 = 기간 집계 (실제로 들어온 결제) + 진행 중 리스 계약의 월 청구액
 *   비용 = **월 고정비** (차량 리스료 · 보험료 · 주차장 계약비)
 * 그래서 기간(days)을 바꾸면 이용 매출만 움직인다. 화면은 이 점을 함께 표기해야
 * "30일로 보면 흑자, 7일로 보면 적자" 같은 착시가 생기지 않는다.
 *
 * 리스 매출(법인 → MOCAR)과 차량 리스료(MOCAR → 리스사)는 이름이 비슷하지만 방향이 반대다:
 * 전자는 LeaseContract, 후자는 VehicleFinance에서 온다.
 */

export interface AccountingInput {
  days: number;
  /** 기간 내 CAPTURED 결제 합계 */
  rentalRevenueKrw: number;
  /** 진행 중 리스 계약의 월 리스료 합계 (법인에 청구) */
  leaseRevenueKrw: number;
  /** MOCAR가 내는 차량 월 리스료 합계 */
  vehicleLeaseCostKrw: number;
  /** 월 보험료 합계 */
  insuranceCostKrw: number;
  /** 유료 존의 월 계약비 합계 */
  zoneContractCostKrw: number;
  counts: OpsAccountingSummaryRes['counts'];
}

export function summarizeAccounting(input: AccountingInput): OpsAccountingSummaryRes {
  const revenueTotal = input.rentalRevenueKrw + input.leaseRevenueKrw;
  const costTotal = input.vehicleLeaseCostKrw + input.insuranceCostKrw + input.zoneContractCostKrw;
  const profitKrw = revenueTotal - costTotal;

  return {
    days: input.days,
    revenue: {
      rentalKrw: input.rentalRevenueKrw,
      leaseKrw: input.leaseRevenueKrw,
      totalKrw: revenueTotal,
    },
    cost: {
      vehicleLeaseKrw: input.vehicleLeaseCostKrw,
      insuranceKrw: input.insuranceCostKrw,
      zoneContractKrw: input.zoneContractCostKrw,
      totalKrw: costTotal,
    },
    profitKrw,
    // 매출이 0이면 마진율은 정의되지 않는다 — 0으로 두고 화면이 '—'로 표기한다
    marginPct: revenueTotal > 0 ? Math.round((profitKrw / revenueTotal) * 1000) / 10 : 0,
    counts: input.counts,
  };
}
