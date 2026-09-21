import type { RentalUsageRes } from '@socar/shared';

/**
 * 이용 화면이 **지금 보여줄 한 단계**.
 *
 * 예전 예약 상세는 체크인·스마트키·이용 중·체크아웃·반납 다섯 카드를 한 페이지에 늘어놓고
 * 잠긴 카드를 흐리게만 했다. 차 앞에 선 사람에게 필요한 건 "지금 할 일 하나"라서,
 * 단계를 판정해 그 단계의 화면만 그린다. 판정은 서버 상태에서만 나온다 —
 * 체크아웃 폼을 열었는지 같은 화면 내부 상태는 여기 넣지 않는다.
 */
export type RentalStage =
  | 'BEFORE_START' // 예약 확정, 이용 시작 전
  | 'CHECK_IN' // 이용 시작함, 차량 상태 촬영 전 — 스마트키가 아직 잠겨 있다
  | 'DRIVING' // 체크인 완료 — 스마트키·연장·사고 접수
  | 'RETURN' // 체크아웃 완료 — 문 잠그고 반납·정산
  | 'DONE' // 반납·정산 완료
  | 'CANCELED';

interface StageInput {
  status: string;
  rental: { status: string } | null;
}

/** 이용 기록(usage)이 아직 안 왔으면 null — 체크인한 사람에게 체크인 폼이 번쩍이지 않게 한다 */
export function rentalStage(
  resv: StageInput,
  usage: Pick<RentalUsageRes, 'checkIn' | 'checkOut'> | undefined,
): RentalStage | null {
  if (resv.status === 'CANCELED') return 'CANCELED';
  if (!resv.rental) return 'BEFORE_START';
  if (resv.rental.status === 'COMPLETED') return 'DONE';
  // 반납은 눌렀는데 정산이 실패한 상태 — 반납 화면에서 재시도한다
  if (resv.rental.status === 'RETURN_PENDING') return 'RETURN';
  if (!usage) return null;
  if (!usage.checkIn) return 'CHECK_IN';
  return usage.checkOut ? 'RETURN' : 'DRIVING';
}

/** 진행 표시줄의 세 칸 — 화면 단계(체크아웃 폼 포함)를 어느 칸에 둘지 */
export const PROGRESS_STEPS = [
  { key: 'CHECK_IN', label: '체크인' },
  { key: 'DRIVING', label: '이용 중' },
  { key: 'RETURN', label: '반납' },
] as const;

export type ProgressKey = (typeof PROGRESS_STEPS)[number]['key'];

export function progressState(step: ProgressKey, current: ProgressKey | 'DONE'): 'done' | 'current' | 'todo' {
  if (current === 'DONE') return 'done';
  const order = PROGRESS_STEPS.map((s) => s.key);
  const diff = order.indexOf(step) - order.indexOf(current);
  return diff < 0 ? 'done' : diff === 0 ? 'current' : 'todo';
}

interface MineRow {
  id: string;
  status: string;
  rental: { status: string; startedAt?: string | null } | null;
}

/**
 * 홈이 지도 대신 이용 화면을 보여줄 예약 — 이용 중인 것 가운데 가장 최근에 시작한 것.
 * 이용 중에는 차를 찾을 일이 없고, 필요한 건 스마트키와 반납이다.
 */
export function pickActiveReservation<T extends MineRow>(rows: T[] | undefined): T | null {
  const active = (rows ?? []).filter((r) => r.status === 'IN_USE' && r.rental);
  if (active.length === 0) return null;
  return active.reduce((latest, r) =>
    (r.rental?.startedAt ?? '') > (latest.rental?.startedAt ?? '') ? r : latest,
  );
}
