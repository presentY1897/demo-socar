import {
  expiryDDay,
  isExpiringSoon,
  isLowFuel,
  OPS_ALERT_META,
  type FuelTypeValue,
  type OpsAlertRes,
} from '@socar/shared';

/**
 * 경고 피드 판정 — 순수 함수 (M3-3).
 *
 * "무엇이 경고인가"를 서비스 안에 흩뿌리지 않고 여기 한 곳에 둔다. 임계치(20% · D-30)는
 * shared가 갖고 있어서 화면과 어긋나지 않고, 문구 조립까지 여기서 끝내므로
 * 서비스는 재료만 모아 넘기면 된다. 시각(now)을 주입받아 테스트가 시간을 고정할 수 있다.
 */

export interface AlertInput {
  lowFuel: {
    vehicleId: string;
    label: string;
    fuel: FuelTypeValue;
    fuelPct: number;
  }[];
  insuranceExpiring: {
    vehicleId: string;
    label: string;
    insurerName: string;
    expiresAt: Date;
  }[];
  contractExpiring: {
    zoneId: string;
    zoneName: string;
    partnerName: string | null;
    contractEnd: Date;
  }[];
  lateReturns: {
    userId: string;
    userName: string;
    label: string;
    endAt: Date;
  }[];
}

/** 심각한 것부터, 같은 심각도면 임박한 것부터 */
export function buildOpsAlerts(input: AlertInput, now: Date = new Date()): OpsAlertRes[] {
  const alerts: OpsAlertRes[] = [
    ...input.lowFuel.filter((v) => isLowFuel(v.fuelPct)).map((v) => alert('LOW_FUEL', {
      targetId: v.vehicleId,
      title: `${v.label} ${gaugeName(v.fuel)} ${Math.round(v.fuelPct)}%`,
      detail: `${gaugeName(v.fuel)}가 ${Math.round(v.fuelPct)}% 남았어요 — ${v.fuel === 'EV' ? '충전' : '주유'}이 필요합니다`,
      at: null,
      dDay: null,
    })),

    ...input.insuranceExpiring
      .map((v) => ({ ...v, dDay: expiryDDay(v.expiresAt, now) }))
      .filter((v) => isExpiringSoon(v.dDay))
      .map((v) => alert('INSURANCE_EXPIRING', {
        targetId: v.vehicleId,
        title: `${v.label} 보험 ${dDayLabel(v.dDay)}`,
        detail: `${v.insurerName} 보험이 ${v.expiresAt.toISOString().slice(0, 10)}에 만료됩니다`,
        at: v.expiresAt.toISOString(),
        dDay: v.dDay,
      })),

    ...input.contractExpiring
      .map((z) => ({ ...z, dDay: expiryDDay(z.contractEnd, now) }))
      .filter((z) => isExpiringSoon(z.dDay))
      .map((z) => alert('CONTRACT_EXPIRING', {
        targetId: z.zoneId,
        title: `${z.zoneName} 계약 ${dDayLabel(z.dDay)}`,
        detail: `${z.partnerName ?? '제휴사'}와의 주차장 계약이 ${z.contractEnd.toISOString().slice(0, 10)}에 만료됩니다`,
        at: z.contractEnd.toISOString(),
        dDay: z.dDay,
      })),

    ...input.lateReturns.map((r) => alert('LATE_RETURN', {
      targetId: r.userId,
      title: `${r.userName}님 반납 ${overdueLabel(r.endAt, now)} 지연`,
      detail: `${r.label} — 반납 예정 ${r.endAt.toISOString()}이 지났는데 아직 이용 중입니다`,
      at: r.endAt.toISOString(),
      dDay: null,
    })),
  ];

  return alerts.sort((a, b) => {
    const bySeverity = rank(b.severity) - rank(a.severity);
    if (bySeverity !== 0) return bySeverity;
    // D-day가 없는 경고(연료·지연)는 같은 심각도 안에서 뒤로 밀지 않고 0으로 본다 —
    // "지금 벌어지고 있는 일"이라 만기 임박과 나란히 두는 게 맞다
    return (a.dDay ?? 0) - (b.dDay ?? 0) || a.title.localeCompare(b.title);
  });
}

const rank = (severity: OpsAlertRes['severity']) => (severity === 'danger' ? 1 : 0);

function alert(
  kind: keyof typeof OPS_ALERT_META,
  rest: Omit<OpsAlertRes, 'id' | 'kind' | 'severity' | 'tab'>,
): OpsAlertRes {
  const meta = OPS_ALERT_META[kind];
  return {
    id: `${kind}:${rest.targetId}`,
    kind,
    severity: meta.severity,
    tab: meta.tab,
    ...rest,
  };
}

const gaugeName = (fuel: FuelTypeValue) => (fuel === 'EV' ? '배터리' : '연료');

const dDayLabel = (dDay: number) => (dDay < 0 ? `만기 ${-dDay}일 경과` : `D-${dDay}`);

function overdueLabel(endAt: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((now.getTime() - endAt.getTime()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
}
