import { describe, expect, it } from 'vitest';
import { LATE_FEE_PER_MIN_KRW, quote, settle, validateSlotRange } from './engine';
import type { PlanRates } from './types';

const plan: PlanRates = {
  baseHourlyKrw: 6000,
  weekendHourlyKrw: 7500,
  perKmKrw: 200,
  insuranceLightKrw: 700,
  insuranceStandardKrw: 1400,
  insuranceFullKrw: 2200,
};

// 2026-09-02 = 수요일, 2026-09-05 = 토요일 (KST)
const wed = (h: number, m = 0) => new Date(`2026-09-02T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`);
const sat = (h: number, m = 0) => new Date(`2026-09-05T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`);

describe('validateSlotRange', () => {
  it('30분 단위가 아니면 거부한다', () => {
    expect(validateSlotRange(new Date('2026-09-02T10:10:00+09:00'), wed(12))).toMatch('30분 단위');
  });
  it('역순/0길이 구간을 거부한다', () => {
    expect(validateSlotRange(wed(12), wed(10))).toBeTruthy();
    expect(validateSlotRange(wed(10), wed(10))).toBeTruthy();
  });
  it('72시간 초과를 거부한다', () => {
    expect(validateSlotRange(wed(10), new Date(wed(10).getTime() + 73 * 3600000))).toMatch('최대');
  });
  it('정상 구간은 통과한다', () => {
    expect(validateSlotRange(wed(10), wed(12, 30))).toBeNull();
  });
});

describe('quote — 대여요금', () => {
  it('주중 2시간: 시간당 단가 × 2', () => {
    const q = quote({ plan, startAt: wed(10), endAt: wed(12), insurance: 'LIGHT' });
    expect(q.slotCount).toBe(4);
    expect(q.rentalFeeKrw).toBe(12000);
    expect(q.insuranceFeeKrw).toBe(1400);
    expect(q.totalUpfrontKrw).toBe(13400);
  });

  it('주말 슬롯에는 주말 단가를 적용한다', () => {
    const q = quote({ plan, startAt: sat(10), endAt: sat(12), insurance: 'LIGHT' });
    expect(q.rentalFeeKrw).toBe(15000);
  });

  it('금요일 밤→토요일 새벽처럼 경계를 넘는 구간은 슬롯별로 단가가 갈린다', () => {
    // 금 23:00 ~ 토 01:00 (KST): 주중 2슬롯 + 주말 2슬롯
    const q = quote({
      plan,
      startAt: new Date('2026-09-04T23:00:00+09:00'),
      endAt: new Date('2026-09-05T01:00:00+09:00'),
      insurance: 'LIGHT',
    });
    expect(q.rentalFeeKrw).toBe(6000 + 7500);
  });
});

describe('quote — 할인 적용 순서', () => {
  it('쿠폰 → 크레딧 순서로 차감하고 0 아래로 내려가지 않는다', () => {
    const q = quote({
      plan,
      startAt: wed(10),
      endAt: wed(11), // 대여 6000 + 보험 700 = 6700
      insurance: 'LIGHT',
      couponDiscountKrw: 5000,
      creditBalanceKrw: 10000,
      useCredit: true,
    });
    expect(q.discountKrw).toBe(5000);
    expect(q.creditUsedKrw).toBe(1700); // 잔액 10000이지만 남은 금액까지만
    expect(q.totalUpfrontKrw).toBe(0);
  });

  it('쿠폰이 총액보다 크면 총액까지만 할인한다', () => {
    const q = quote({
      plan,
      startAt: wed(10),
      endAt: wed(11),
      insurance: 'LIGHT',
      couponDiscountKrw: 99999,
    });
    expect(q.discountKrw).toBe(6700);
    expect(q.totalUpfrontKrw).toBe(0);
  });

  it('useCredit=false면 크레딧을 쓰지 않는다', () => {
    const q = quote({
      plan,
      startAt: wed(10),
      endAt: wed(11),
      insurance: 'LIGHT',
      creditBalanceKrw: 10000,
      useCredit: false,
    });
    expect(q.creditUsedKrw).toBe(0);
  });
});

describe('settle — 반납 정산', () => {
  it('주행요금 = 거리 × km단가, 지연요금 = 분 × 정액', () => {
    const s = settle({ plan, distanceKm: 42.5, lateMinutes: 20 });
    expect(s.driveFeeKrw).toBe(8500);
    expect(s.lateFeeKrw).toBe(20 * LATE_FEE_PER_MIN_KRW);
    expect(s.totalKrw).toBe(8500 + 4000);
  });

  it('음수 입력은 0으로 처리한다', () => {
    const s = settle({ plan, distanceKm: -1, lateMinutes: -5 });
    expect(s.totalKrw).toBe(0);
  });
});
