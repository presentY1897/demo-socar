import { describe, expect, it } from 'vitest';
import type { HandlerTaskRes } from '@socar/shared';
import {
  taskDeliveryOpen,
  taskDoneThisWeek,
  taskDoneToday,
  taskRepositionUpcoming,
  taskRetrieveMine,
} from '@/test/msw/fixtures';
import { buildTaskBoard } from '@/lib/ops-tasks';

const all: HandlerTaskRes[] = [
  taskRepositionUpcoming, // ASSIGNED · 내일
  taskDeliveryOpen, // PENDING · 3시간 뒤
  taskRetrieveMine, // ASSIGNED · 1시간 전 (지연)
  taskDoneToday, // DONE · 오늘
  taskDoneThisWeek, // DONE · 3일 전
];

describe('buildTaskBoard', () => {
  it('한 목록을 미배정 / 진행 중으로 가르고 각각 기한 순으로 놓는다', () => {
    const board = buildTaskBoard(all);

    expect(board.unassigned.map((t) => t.id)).toEqual([taskDeliveryOpen.id]);
    expect(board.inProgress.map((t) => t.id)).toEqual([
      taskRetrieveMine.id, // 기한이 더 이르다(이미 지남)
      taskRepositionUpcoming.id,
    ]);
  });

  it('오늘 처리량은 오늘 끝낸 것만 센다 — 누적이 아니다', () => {
    const board = buildTaskBoard(all);

    expect(board.throughput).toHaveLength(1);
    expect(board.throughput[0]).toMatchObject({
      handlerId: 'user-handler',
      name: '한기사',
      doneToday: 1, // 사흘 전 완료분은 빠진다
      active: 2, // 배정됨 2건
    });
  });

  it('지연 건수는 서버가 준 overdue를 그대로 센다', () => {
    expect(buildTaskBoard(all).overdueCount).toBe(1);
  });

  it('담당자가 없는 작업은 처리량 집계에 끼지 않는다', () => {
    const board = buildTaskBoard([taskDeliveryOpen]);

    expect(board.throughput).toEqual([]);
    expect(board.unassigned).toHaveLength(1);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const before = all.map((t) => t.id);
    buildTaskBoard(all);
    expect(all.map((t) => t.id)).toEqual(before);
  });
});
