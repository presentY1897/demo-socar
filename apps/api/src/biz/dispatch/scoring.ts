/**
 * 배차 후보 스코어링 — 순수 함수.
 *
 * score = 100 × (0.4×이동시간 + 0.25×반납버퍼 + 0.15×지연리스크 + 0.2×전용차량)
 *  - 이동시간: 30분 도보를 0점, 0분을 1점으로 선형
 *  - 반납버퍼: 직전 예약 반납 후 여유. 120분 이상이면 만점, 앞 예약이 없으면 만점
 *  - 지연리스크: 차량의 최근 지연 반납률이 낮을수록 높음
 *  - 전용차량: 법인 소유/장기렌트 차량(FMS)은 이용 과금이 없어 우선 배차
 *
 * 점수는 정렬 기준일 뿐, 근거(reasons)를 함께 제시해 담당자가 판단하게 한다.
 */

export interface CandidateInput {
  vehicleId: string;
  zoneName: string;
  walkSeconds: number;
  walkMeters: number;
  travelMethod: 'graph-astar' | 'haversine';
  /** 직전 예약 반납 예정 시각과 희망 시작 시각의 간격(분). 앞 예약이 없으면 null */
  bufferMinutes: number | null;
  /** 최근 30일 지연 반납률 (0~100) */
  lateRiskPct: number;
  /** 법인 전용 차량 여부 (FMS) */
  isDedicated: boolean;
}

export interface ScoredCandidate extends CandidateInput {
  score: number;
  reasons: string[];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const WEIGHTS = { walk: 0.4, buffer: 0.25, risk: 0.15, dedicated: 0.2 } as const;
export const WALK_CAP_SECONDS = 1800;
export const BUFFER_CAP_MINUTES = 120;

export function scoreCandidate(input: CandidateInput): ScoredCandidate {
  const walkScore = clamp01(1 - input.walkSeconds / WALK_CAP_SECONDS);
  const bufferScore =
    input.bufferMinutes === null ? 1 : clamp01(input.bufferMinutes / BUFFER_CAP_MINUTES);
  const riskScore = clamp01(1 - input.lateRiskPct / 100);
  const dedicatedScore = input.isDedicated ? 1 : 0;

  const score =
    Math.round(
      100 *
        (WEIGHTS.walk * walkScore +
          WEIGHTS.buffer * bufferScore +
          WEIGHTS.risk * riskScore +
          WEIGHTS.dedicated * dedicatedScore) *
        10,
    ) / 10;

  const walkMin = Math.max(1, Math.round(input.walkSeconds / 60));
  const reasons: string[] = [
    input.isDedicated
      ? '법인 전용 차량 — 이용 과금 없음, 운행일지 자동 기록'
      : '인근 공유존 차량 — 시간당 과금 (법인카드)',
    `${input.zoneName}까지 도보 약 ${walkMin}분 (${input.walkMeters}m${
      input.travelMethod === 'haversine' ? ', 직선거리 추정' : ''
    })`,
  ];

  if (input.bufferMinutes === null) {
    reasons.push('해당 시간대 앞 예약 없음');
  } else {
    reasons.push(`직전 반납 예정 후 ${input.bufferMinutes}분 여유`);
    if (input.bufferMinutes < 15) {
      reasons.push('⚠ 반납이 지연되면 이용에 영향이 있을 수 있어요');
    }
  }

  if (input.lateRiskPct >= 20) {
    reasons.push(`⚠ 최근 30일 지연 반납률 ${Math.round(input.lateRiskPct)}%`);
  } else {
    reasons.push(`최근 30일 지연 반납률 ${Math.round(input.lateRiskPct)}%`);
  }

  return { ...input, score, reasons };
}

/** 점수 내림차순 정렬 + rank 부여 */
export function rankCandidates(inputs: CandidateInput[]): (ScoredCandidate & { rank: number })[] {
  return inputs
    .map(scoreCandidate)
    .sort((a, b) => b.score - a.score)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
