/**
 * 편도 예약이 있으면 차량의 위치는 시간의 함수가 된다.
 *
 * vehicle.zoneId는 "물리적 현재 존"(반납 완료 시 갱신)이고,
 * 시각 t의 유효 위치는 거기서 시작해 t 이전에 끝나는 미완료 예약(CONFIRMED/IN_USE)을
 * 시간순으로 적용하며 편도 반납 존으로 이동시킨 결과다.
 * 탐색·가용성 판정은 반드시 이 함수를 거친다. (ADR-005)
 */

export interface ChainReservation {
  endAt: Date;
  returnZoneId: string | null;
}

/** reservations는 CONFIRMED/IN_USE만, 정렬은 함수가 처리 */
export function effectiveZoneIdAt(
  baseZoneId: string,
  reservations: ChainReservation[],
  t: Date,
): string {
  let zoneId = baseZoneId;
  const past = reservations
    .filter((r) => r.endAt.getTime() <= t.getTime())
    .sort((a, b) => a.endAt.getTime() - b.endAt.getTime());
  for (const r of past) {
    if (r.returnZoneId) zoneId = r.returnZoneId;
  }
  return zoneId;
}
