import { describe, expect, it } from 'vitest';
import {
  DELIVERY_FEE_MIN_KRW,
  deliveryFee,
  FREE_DRIVE_KM,
  LATE_FEE_PER_MIN_KRW,
  ONEWAY_FEE_MIN_KRW,
  onewayFee,
  quote,
  settle,
  validateSlotRange,
} from './engine';
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
const wed = (h: number, m = 0) =>
  new Date(`2026-09-02T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`);
const sat = (h: number, m = 0) =>
  new Date(`2026-09-05T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`);

describe('validateSlotRange — 10분 단위·최소 30분·최대 28일', () => {
  it('10분 단위가 아니면 거부한다', () => {
    expect(validateSlotRange(new Date('2026-09-02T10:05:00+09:00'), wed(12))).toMatch('10분 단위');
  });
  it('10분 단위 시각은 허용한다 (10:10 시작)', () => {
    expect(validateSlotRange(wed(10, 10), wed(11, 20))).toBeNull();
  });
  it('30분 미만을 거부한다', () => {
    expect(validateSlotRange(wed(10), wed(10, 20))).toMatch('최소');
  });
  it('28일 초과를 거부한다', () => {
    expect(
      validateSlotRange(wed(10), new Date(wed(10).getTime() + 29 * 24 * 3600000)),
    ).toMatch('최대');
  });
  it('역순/0길이 구간을 거부한다', () => {
    expect(validateSlotRange(wed(12), wed(10))).toBeTruthy();
    expect(validateSlotRange(wed(10), wed(10))).toBeTruthy();
  });
});

describe('quote — 대여요금 (10분 슬롯)', () => {
  it('주중 2시간 = 12슬롯: 시간당 단가 × 2', () => {
    const q = quote({ plan, startAt: wed(10), endAt: wed(12), insurance: 'LIGHT' });
    expect(q.slotCount).toBe(12);
    expect(q.rentalFeeKrw).toBe(12000);
    expect(q.insuranceFeeKrw).toBe(1400);
    expect(q.totalUpfrontKrw).toBe(13400);
  });

  it('50분처럼 시간 미만 단위도 슬롯대로 계산한다', () => {
    const q = quote({ plan, startAt: wed(10), endAt: wed(10, 50), insurance: 'LIGHT' });
    expect(q.slotCount).toBe(5);
    expect(q.rentalFeeKrw).toBe(5000); // 6000 × 5/6
  });

  it('주말 슬롯에는 주말 단가를 적용한다', () => {
    const q = quote({ plan, startAt: sat(10), endAt: sat(12), insurance: 'LIGHT' });
    expect(q.rentalFeeKrw).toBe(15000);
  });

  it('금요일 밤→토요일 새벽 경계 구간은 슬롯별로 단가가 갈린다', () => {
    const q = quote({
      plan,
      startAt: new Date('2026-09-04T23:00:00+09:00'),
      endAt: new Date('2026-09-05T01:00:00+09:00'),
      insurance: 'LIGHT',
    });
    expect(q.rentalFeeKrw).toBe(6000 + 7500);
  });
});

describe('quote — 편도 수수료와 할인 적용 순서', () => {
  it('편도 수수료는 선결제 총액에 포함된다', () => {
    const q = quote({
      plan,
      startAt: wed(10),
      endAt: wed(11),
      insurance: 'LIGHT',
      onewayFeeKrw: 7000,
    });
    expect(q.onewayFeeKrw).toBe(7000);
    expect(q.totalUpfrontKrw).toBe(6000 + 700 + 7000);
  });

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
    expect(q.creditUsedKrw).toBe(1700);
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
    expect(q.totalUpfrontKrw).toBe(0);
  });
});

describe('onewayFee', () => {
  it('거리 비례 (km × 500원, 100원 단위)', () => {
    expect(onewayFee(20000)).toBe(10000); // 20km
  });
  it('최소 5,000원을 보장한다', () => {
    expect(onewayFee(1200)).toBe(ONEWAY_FEE_MIN_KRW);
  });
});

describe('deliveryFee — 부름(탁송) 요금', () => {
  it('거리 비례 (km × 1,500원, 100원 단위)', () => {
    expect(deliveryFee(4000)).toBe(6000); // 4km
    expect(deliveryFee(5000)).toBe(7500);
  });
  it('최소 6,000원을 보장한다', () => {
    expect(deliveryFee(800)).toBe(DELIVERY_FEE_MIN_KRW);
  });
  it('quote 선결제 총액에 포함된다', () => {
    const q = quote({
      plan,
      startAt: wed(10),
      endAt: wed(11),
      insurance: 'LIGHT',
      deliveryFeeKrw: 7500,
    });
    expect(q.deliveryFeeKrw).toBe(7500);
    expect(q.totalUpfrontKrw).toBe(6000 + 700 + 7500);
  });
});

describe('settle — 반납 정산 (30km 면제·EV 무료)', () => {
  it(`내연기관은 ${FREE_DRIVE_KM}km 초과분만 과금한다`, () => {
    const s = settle({ plan, fuel: 'GASOLINE', distanceKm: 42.5, lateMinutes: 0 });
    expect(s.driveFeeKrw).toBe(Math.round(12.5 * 200));
  });

  it(`${FREE_DRIVE_KM}km 이하는 주행요금이 없다`, () => {
    const s = settle({ plan, fuel: 'HYBRID', distanceKm: 29.9, lateMinutes: 0 });
    expect(s.driveFeeKrw).toBe(0);
  });

  it('전기차는 거리와 무관하게 주행요금이 무료다', () => {
    const s = settle({ plan, fuel: 'EV', distanceKm: 500, lateMinutes: 0 });
    expect(s.driveFeeKrw).toBe(0);
  });

  it('지연요금 = 분 × 정액 (연료 무관)', () => {
    const s = settle({ plan, fuel: 'EV', distanceKm: 10, lateMinutes: 20 });
    expect(s.lateFeeKrw).toBe(20 * LATE_FEE_PER_MIN_KRW);
    expect(s.totalKrw).toBe(s.lateFeeKrw);
  });

  it('음수 입력은 0으로 처리한다', () => {
    const s = settle({ plan, fuel: 'GASOLINE', distanceKm: -1, lateMinutes: -5 });
    expect(s.totalKrw).toBe(0);
  });
});
