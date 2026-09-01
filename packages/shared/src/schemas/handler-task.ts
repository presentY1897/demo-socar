import { z } from 'zod';
import { requiredPhotosSchema } from './photo';

/**
 * 핸들러(운송기사) 작업 도메인 — 타입·상태와 상태 전이 규칙.
 *
 * 전이 규칙을 API와 화면이 각자 들고 있으면 버튼은 눌리는데 서버가 거절하는(또는 그 반대)
 * 어긋남이 생긴다 — 스마트키(control.ts)와 같은 이유로 규칙은 여기 한 벌만 둔다.
 */

export const handlerTaskTypeSchema = z.enum(['DELIVERY', 'RETRIEVE', 'REPOSITION']);
export type HandlerTaskTypeValue = z.infer<typeof handlerTaskTypeSchema>;

export const handlerTaskStatusSchema = z.enum([
  'PENDING',
  'ASSIGNED',
  'EN_ROUTE',
  'DONE',
  'CANCELED',
]);
export type HandlerTaskStatusValue = z.infer<typeof handlerTaskStatusSchema>;

/** 작업 카드의 타입 배지 — 화면과 테스트가 같은 문구를 본다 */
export const HANDLER_TASK_TYPE_META: Record<
  HandlerTaskTypeValue,
  { label: string; icon: string; description: string }
> = {
  DELIVERY: { label: '배달', icon: '🚚', description: '부름 수령지로 차량 배달' },
  RETRIEVE: { label: '회수', icon: '↩️', description: '이용 종료 지점에서 원래 존으로 회수' },
  REPOSITION: { label: '재배치', icon: '🔁', description: '존 사이 차량 재배치' },
};

export const HANDLER_TASK_STATUS_META: Record<HandlerTaskStatusValue, { label: string }> = {
  PENDING: { label: '미배정' },
  ASSIGNED: { label: '배정됨' },
  EN_ROUTE: { label: '이동 중' },
  DONE: { label: '완료' },
  CANCELED: { label: '취소' },
};

/**
 * 허용 전이 — 누가 만드는 전이인지까지 여기 적어 둔다.
 *
 *   PENDING  → ASSIGNED   핸들러 수락(`/handler/tasks/:id/accept`) 또는 운영자 배정(`/ops/tasks/:id/assign`)
 *   ASSIGNED → ASSIGNED   운영자 재배정 — 이동 시작 전에만 (담당자만 바뀐다)
 *   ASSIGNED → EN_ROUTE   핸들러 이동 시작(`/handler/tasks/:id/start`)
 *   EN_ROUTE → DONE       핸들러 완료(`/handler/tasks/:id/complete`) — 인계 사진 + 메모 필수
 *   PENDING/ASSIGNED → CANCELED  연결 예약 취소 시 자동 정리 (M2-2)
 *
 * DONE·CANCELED는 종착이고, 이동을 이미 시작한 작업(EN_ROUTE)은 취소하지 않는다 —
 * 차를 옮기는 중에 작업만 사라지면 차량의 실제 위치를 아무도 책임지지 않게 된다.
 */
export const HANDLER_TASK_TRANSITIONS: Record<
  HandlerTaskStatusValue,
  readonly HandlerTaskStatusValue[]
> = {
  PENDING: ['ASSIGNED', 'CANCELED'],
  ASSIGNED: ['ASSIGNED', 'EN_ROUTE', 'CANCELED'],
  EN_ROUTE: ['DONE'],
  DONE: [],
  CANCELED: [],
};

/** 더 이상 바뀌지 않는 상태 (완료·취소) */
export const isTerminalHandlerTaskStatus = (status: HandlerTaskStatusValue): boolean =>
  HANDLER_TASK_TRANSITIONS[status].length === 0;

/** 아직 살아 있는 작업 — 핸들러 큐와 운영 목록의 기본 필터 */
export const ACTIVE_HANDLER_TASK_STATUSES: readonly HandlerTaskStatusValue[] = [
  'PENDING',
  'ASSIGNED',
  'EN_ROUTE',
];

export function canTransitionHandlerTask(
  from: HandlerTaskStatusValue,
  to: HandlerTaskStatusValue,
): boolean {
  return HANDLER_TASK_TRANSITIONS[from].includes(to);
}

/** 지연 — 기한이 지났는데 아직 끝나지 않은 작업 (목록의 지연 경고) */
export function isHandlerTaskOverdue(
  task: { status: HandlerTaskStatusValue; dueAt: Date | string },
  now: Date = new Date(),
): boolean {
  if (isTerminalHandlerTaskStatus(task.status)) return false;
  return new Date(task.dueAt).getTime() < now.getTime();
}

/**
 * 부름 회수 기한 — 이용 종료(정산 완료) 후 이 시간 안에 원래 존으로 되돌린다.
 *
 * 배달의 기한은 "이용 시작"이라는 약속된 시각에서 거꾸로 잡히지만(ADR-006 리드타임),
 * 회수는 뒤에 기다리는 사람이 없어 기준이 될 시각이 없다. 그렇다고 무기한이면
 * 차가 수령지에 방치되므로 반납 시각 기준의 여유 시간을 기한으로 둔다.
 */
export const HANDLER_RETRIEVE_DUE_MINUTES = 120;

/**
 * 작업 완료 요청 — 인계 사진과 메모는 "그 자리에 차를 뒀다"는 유일한 증빙이라 둘 다 필수다.
 * 체크인/아웃(M1-3)과 같은 사진 규격을 쓴다.
 */
export const completeHandlerTaskSchema = z.object({
  note: z
    .string()
    .min(1, '인계 메모를 남겨 주세요')
    .max(500, '메모는 500자까지 쓸 수 있어요'),
  photos: requiredPhotosSchema,
});
export type CompleteHandlerTaskDto = z.infer<typeof completeHandlerTaskSchema>;
