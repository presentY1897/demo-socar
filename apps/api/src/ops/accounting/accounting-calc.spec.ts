import { summarizeAccounting, type AccountingInput } from './accounting-calc';

const input = (over: Partial<AccountingInput> = {}): AccountingInput => ({
  days: 30,
  rentalRevenueKrw: 4_000_000,
  leaseRevenueKrw: 1_580_000,
  vehicleLeaseCostKrw: 2_000_000,
  insuranceCostKrw: 800_000,
  zoneContractCostKrw: 1_200_000,
  counts: { vehicleCount: 73, leasedVehicleCount: 25, paidZoneCount: 20, activeLeaseCount: 2 },
  ...over,
});

describe('회계 집계 (summarizeAccounting)', () => {
  it('매출은 이용 결제 + 리스 청구, 비용은 세 갈래의 합이다', () => {
    const s = summarizeAccounting(input());
    expect(s.revenue.totalKrw).toBe(5_580_000);
    expect(s.cost.totalKrw).toBe(4_000_000);
    expect(s.profitKrw).toBe(1_580_000);
  });

  it('마진율은 매출 대비 손익 (소수 첫째 자리)', () => {
    expect(summarizeAccounting(input()).marginPct).toBe(28.3);
  });

  it('적자면 손익과 마진율이 함께 음수다', () => {
    const s = summarizeAccounting(input({ rentalRevenueKrw: 100_000, leaseRevenueKrw: 0 }));
    expect(s.profitKrw).toBe(-3_900_000);
    expect(s.marginPct).toBeLessThan(0);
  });

  it('매출이 0이면 마진율은 0으로 둔다 (0으로 나누지 않는다)', () => {
    const s = summarizeAccounting(input({ rentalRevenueKrw: 0, leaseRevenueKrw: 0 }));
    expect(s.marginPct).toBe(0);
    expect(s.profitKrw).toBe(-4_000_000);
  });

  it('비용은 월 고정비라 기간을 바꿔도 그대로다 — 움직이는 건 이용 매출뿐', () => {
    const month = summarizeAccounting(input());
    const week = summarizeAccounting(input({ days: 7, rentalRevenueKrw: 900_000 }));
    expect(week.cost).toEqual(month.cost);
    expect(week.revenue.leaseKrw).toBe(month.revenue.leaseKrw);
    expect(week.revenue.rentalKrw).not.toBe(month.revenue.rentalKrw);
  });
});
