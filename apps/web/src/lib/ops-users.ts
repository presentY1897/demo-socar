import { USER_RISK_THRESHOLDS, type OpsUserRiskRes } from '@socar/shared';

/**
 * 유의 유저 배지 — 집계 숫자를 화면 문구로 옮기는 표시 변환.
 *
 * 정렬 점수(riskScore)는 순위를 만드는 값일 뿐 사람이 읽는 값이 아니다(shared 주석).
 * 화면에는 "무엇이 몇 번"만 보여주고, **임계치를 넘은 항목만 빨갛게** 칠한다 —
 * 임계치는 shared(USER_RISK_THRESHOLDS)가 단일 소스라 API 목록 기준과 어긋나지 않는다.
 */
export interface RiskBadge {
  key: 'lateReturns' | 'incidents' | 'paymentFails';
  label: string;
  count: number;
  /** 이 항목 하나만으로도 목록에 오를 만한 수준인가 */
  over: boolean;
}

const LABEL: Record<RiskBadge['key'], string> = {
  lateReturns: '지연 반납',
  incidents: '사고 접수',
  paymentFails: '결제 거절',
};

/** 0건인 항목은 배지를 만들지 않는다 — 없는 사실을 굳이 보여줄 이유가 없다 */
export function riskBadges(user: OpsUserRiskRes): RiskBadge[] {
  const counts: Record<RiskBadge['key'], number> = {
    lateReturns: user.lateReturnCount,
    incidents: user.incidentCount,
    paymentFails: user.paymentFailCount,
  };
  return (Object.keys(counts) as RiskBadge['key'][])
    .filter((key) => counts[key] > 0)
    .map((key) => ({
      key,
      label: LABEL[key],
      count: counts[key],
      over: counts[key] >= USER_RISK_THRESHOLDS[key],
    }));
}
