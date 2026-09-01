import dayjs from 'dayjs';
import { ACTIVE_HANDLER_TASK_STATUSES, type HandlerTaskRes } from '@socar/shared';

/**
 * 작업/배차 보드 — 한 번 받은 작업 목록을 화면의 세 덩어리로 가르는 순수 함수.
 *
 * 서버에 상태별로 세 번 묻지 않는다: 운영자가 보는 건 "지금 이 순간의 전체 판"이라
 * 세 목록이 서로 다른 시점의 스냅샷이면 합계가 맞지 않는다.
 */
export interface HandlerThroughput {
  handlerId: string;
  name: string;
  /** 오늘(로컬 달력) 완료한 작업 수 */
  doneToday: number;
  /** 아직 손에 쥐고 있는 작업 수 (배정됨 + 이동 중) */
  active: number;
}

export interface TaskBoard {
  unassigned: HandlerTaskRes[];
  inProgress: HandlerTaskRes[];
  throughput: HandlerThroughput[];
  overdueCount: number;
}

const byDue = (a: HandlerTaskRes, b: HandlerTaskRes) =>
  new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();

export function buildTaskBoard(
  tasks: readonly HandlerTaskRes[],
  now: Date = new Date(),
): TaskBoard {
  const unassigned = tasks.filter((t) => t.status === 'PENDING').sort(byDue);
  const inProgress = tasks
    .filter((t) => t.status === 'ASSIGNED' || t.status === 'EN_ROUTE')
    .sort(byDue);

  const rows = new Map<string, HandlerThroughput>();
  const touch = (id: string, name: string) => {
    const existing = rows.get(id);
    if (existing) return existing;
    const created = { handlerId: id, name, doneToday: 0, active: 0 };
    rows.set(id, created);
    return created;
  };

  for (const t of tasks) {
    if (!t.assigneeId) continue;
    const row = touch(t.assigneeId, t.assigneeName ?? t.assigneeId);
    // 완료는 "오늘 끝낸 것"만 센다 — 어제까지 합치면 처리량이 아니라 누적이 된다
    if (t.status === 'DONE' && t.completedAt && dayjs(t.completedAt).isSame(now, 'day')) {
      row.doneToday += 1;
    }
    if (ACTIVE_HANDLER_TASK_STATUSES.includes(t.status) && t.status !== 'PENDING') {
      row.active += 1;
    }
  }

  const throughput = [...rows.values()].sort(
    (a, b) => b.doneToday - a.doneToday || a.name.localeCompare(b.name, 'ko'),
  );

  return {
    unassigned,
    inProgress,
    throughput,
    // 지연 판정은 서버가 준 overdue를 그대로 쓴다 (shared isHandlerTaskOverdue 기준)
    overdueCount: [...unassigned, ...inProgress].filter((t) => t.overdue).length,
  };
}
