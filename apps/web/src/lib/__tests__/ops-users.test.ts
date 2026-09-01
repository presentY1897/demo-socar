import { describe, expect, it } from 'vitest';
import { USER_RISK_THRESHOLDS, type OpsUserRiskRes } from '@socar/shared';
import { riskBadges } from '@/lib/ops-users';

const user = (over: Partial<OpsUserRiskRes>): OpsUserRiskRes => ({
  id: 'u',
  name: '홍길동',
  email: 'u@x.kr',
  role: 'USER',
  lateReturnCount: 0,
  incidentCount: 0,
  paymentFailCount: 0,
  riskScore: 0,
  lastLateAt: null,
  ...over,
});

describe('riskBadges', () => {
  it('0건인 항목은 배지를 만들지 않는다', () => {
    expect(riskBadges(user({ incidentCount: 1 })).map((b) => b.key)).toEqual(['incidents']);
    expect(riskBadges(user({}))).toEqual([]);
  });

  it('임계치를 넘은 항목만 강조 대상이 된다 — 기준은 shared 한 곳', () => {
    const one = riskBadges(user({ lateReturnCount: 1 }))[0];
    expect(USER_RISK_THRESHOLDS.lateReturns).toBe(2);
    expect(one.over).toBe(false); // 지연 반납 1회는 누구나 있다

    const two = riskBadges(user({ lateReturnCount: 2 }))[0];
    expect(two.over).toBe(true);
  });

  it('사고·결제 거절은 1건만 있어도 강조한다', () => {
    expect(riskBadges(user({ incidentCount: 1 }))[0].over).toBe(true);
    expect(riskBadges(user({ paymentFailCount: 1 }))[0].over).toBe(true);
  });

  it('배지 순서는 지연 반납 → 사고 → 결제 거절로 고정이다', () => {
    const badges = riskBadges(user({ lateReturnCount: 3, incidentCount: 1, paymentFailCount: 2 }));
    expect(badges.map((b) => b.key)).toEqual(['lateReturns', 'incidents', 'paymentFails']);
    expect(badges.map((b) => `${b.label} ${b.count}`)).toEqual([
      '지연 반납 3',
      '사고 접수 1',
      '결제 거절 2',
    ]);
  });
});
