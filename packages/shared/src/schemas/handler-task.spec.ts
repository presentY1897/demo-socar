import { describe, expect, it } from 'vitest';
import {
  ACTIVE_HANDLER_TASK_STATUSES,
  canTransitionHandlerTask,
  handlerTaskStatusSchema,
  isHandlerTaskOverdue,
  isTerminalHandlerTaskStatus,
  type HandlerTaskStatusValue,
} from './handler-task';

const ALL = handlerTaskStatusSchema.options;

describe('핸들러 작업 상태 전이 규칙', () => {
  it('수락 → 이동 시작 → 완료의 정상 순서를 통과시킨다', () => {
    expect(canTransitionHandlerTask('PENDING', 'ASSIGNED')).toBe(true);
    expect(canTransitionHandlerTask('ASSIGNED', 'EN_ROUTE')).toBe(true);
    expect(canTransitionHandlerTask('EN_ROUTE', 'DONE')).toBe(true);
  });

  it('단계 건너뛰기와 역행을 막는다', () => {
    expect(canTransitionHandlerTask('PENDING', 'EN_ROUTE')).toBe(false);
    expect(canTransitionHandlerTask('PENDING', 'DONE')).toBe(false);
    expect(canTransitionHandlerTask('ASSIGNED', 'DONE')).toBe(false);
    expect(canTransitionHandlerTask('EN_ROUTE', 'ASSIGNED')).toBe(false);
    expect(canTransitionHandlerTask('DONE', 'EN_ROUTE')).toBe(false);
  });

  it('재배정은 이동 시작 전(ASSIGNED)에만 허용한다', () => {
    expect(canTransitionHandlerTask('ASSIGNED', 'ASSIGNED')).toBe(true);
    expect(canTransitionHandlerTask('EN_ROUTE', 'ASSIGNED')).toBe(false);
  });

  it('취소는 아직 출발하지 않은 작업에만 — 이동 중이면 막는다', () => {
    expect(canTransitionHandlerTask('PENDING', 'CANCELED')).toBe(true);
    expect(canTransitionHandlerTask('ASSIGNED', 'CANCELED')).toBe(true);
    expect(canTransitionHandlerTask('EN_ROUTE', 'CANCELED')).toBe(false);
  });

  it('완료·취소는 종착 상태라 어디로도 가지 않는다', () => {
    for (const terminal of ['DONE', 'CANCELED'] as HandlerTaskStatusValue[]) {
      expect(isTerminalHandlerTaskStatus(terminal)).toBe(true);
      for (const to of ALL) {
        expect(canTransitionHandlerTask(terminal, to)).toBe(false);
      }
    }
    for (const active of ACTIVE_HANDLER_TASK_STATUSES) {
      expect(isTerminalHandlerTaskStatus(active)).toBe(false);
    }
  });
});

describe('핸들러 작업 지연 판정', () => {
  const now = new Date('2026-09-01T12:00:00+09:00');
  const past = new Date('2026-09-01T11:30:00+09:00');
  const future = new Date('2026-09-01T12:30:00+09:00');

  it('기한이 지난 미완료 작업만 지연으로 본다', () => {
    expect(isHandlerTaskOverdue({ status: 'ASSIGNED', dueAt: past }, now)).toBe(true);
    expect(isHandlerTaskOverdue({ status: 'PENDING', dueAt: future }, now)).toBe(false);
  });

  it('이미 끝난 작업은 기한이 지났어도 지연이 아니다', () => {
    expect(isHandlerTaskOverdue({ status: 'DONE', dueAt: past }, now)).toBe(false);
    expect(isHandlerTaskOverdue({ status: 'CANCELED', dueAt: past }, now)).toBe(false);
  });

  it('ISO 문자열 dueAt도 그대로 받는다 (API 응답 형태)', () => {
    expect(isHandlerTaskOverdue({ status: 'EN_ROUTE', dueAt: past.toISOString() }, now)).toBe(true);
  });
});
