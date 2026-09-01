import { haversineMeters, type Coord, type HandlerCandidateRes } from '@socar/shared';

/**
 * 배정 추천 — 순수 함수.
 *
 * 기준은 하나다: "핸들러가 마지막으로 일을 끝낸 자리에서 이 작업의 출발지까지 얼마나 먼가".
 * 배차 스코어링(dispatch/scoring.ts)처럼 가중합 점수를 만들지 않는다 — 사람을 보내는 일이라
 * 순서는 거리로 충분하고, 나머지(진행 중 작업 수 등)는 근거로 보여 주고 판단은 운영자가 한다.
 *
 * 거리는 배차의 후보 반경 판정과 같은 직선거리(haversine)를 쓴다. 순서를 정하는 데는
 * 충분하고, 후보 수만큼 경로 탐색(A*)을 돌릴 이유가 없다.
 */

export interface HandlerCandidateInput {
  handlerId: string;
  name: string;
  /** 마지막으로 완료한 작업의 도착지 — 완주 기록이 없으면 null */
  lastPlace: { label: string; lat: number; lng: number } | null;
  lastCompletedAt: Date | null;
  /** 아직 손에 쥐고 있는 작업 수 (배정됨 + 이동 중) */
  activeTaskCount: number;
}

/** 거리 가까운 순. 완주 기록이 없어 거리를 모르는 핸들러는 원래 순서를 유지한 채 뒤로 */
export function rankHandlerCandidates(
  candidates: HandlerCandidateInput[],
  origin: Coord,
): HandlerCandidateRes[] {
  return candidates
    .map((c, index) => ({
      candidate: c,
      index,
      distanceMeters: c.lastPlace ? Math.round(haversineMeters(origin, c.lastPlace)) : null,
    }))
    .sort((a, b) => {
      if (a.distanceMeters === null && b.distanceMeters === null) return a.index - b.index;
      if (a.distanceMeters === null) return 1;
      if (b.distanceMeters === null) return -1;
      return a.distanceMeters - b.distanceMeters || a.index - b.index;
    })
    .map(({ candidate, distanceMeters }) => ({
      handlerId: candidate.handlerId,
      name: candidate.name,
      lastCompletedAt: candidate.lastCompletedAt?.toISOString() ?? null,
      lastPlaceLabel: candidate.lastPlace?.label ?? null,
      distanceMeters,
      activeTaskCount: candidate.activeTaskCount,
      reasons: reasonsFor(candidate, distanceMeters),
    }));
}

function reasonsFor(c: HandlerCandidateInput, distanceMeters: number | null): string[] {
  const reasons: string[] = [];
  if (distanceMeters === null || !c.lastPlace) {
    reasons.push('오늘 완료한 작업이 없어 위치를 알 수 없어요 — 기본 순서');
  } else {
    reasons.push(
      `마지막 완료 지점(${c.lastPlace.label})에서 약 ${(distanceMeters / 1000).toFixed(1)}km`,
    );
  }

  if (c.activeTaskCount === 0) {
    reasons.push('진행 중인 작업 없음');
  } else {
    reasons.push(`진행 중인 작업 ${c.activeTaskCount}건`);
    if (c.activeTaskCount >= 3) reasons.push('⚠ 이미 여러 건을 맡고 있어요');
  }
  return reasons;
}
