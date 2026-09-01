'use client';

import { HANDLER_TASK_TYPE_META, type HandlerTaskRes } from '@socar/shared';
import { fmtDateTime, fmtTime } from '@/lib/format';

/** 타입별 배지 색 — 배달(파랑)/회수(보라)/재배치(회색) */
const TYPE_STYLE: Record<string, string> = {
  DELIVERY: 'bg-sky-100 text-sky-700',
  RETRIEVE: 'bg-indigo-100 text-indigo-700',
  REPOSITION: 'bg-gray-100 text-gray-600',
};

interface Props {
  task: HandlerTaskRes;
  onOpen: (task: HandlerTaskRes) => void;
  /** 카드에서 바로 누르는 동작 (공개 작업의 "수락") */
  quickAction?: { label: string; onClick: () => void; busy?: boolean };
  /** 기한을 날짜까지 보여줄지 (오늘 목록은 시각만) */
  withDate?: boolean;
}

/**
 * 작업 카드 — 배달앱 기사 화면의 문법.
 * 한 장에 "무슨 일 / 어디서 어디로 / 언제까지"만 담고, 나머지는 상세에서 본다.
 */
export function HandlerTaskCard({ task, onOpen, quickAction, withDate = false }: Props) {
  const meta = HANDLER_TASK_TYPE_META[task.type];

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="block w-full text-left"
        aria-label={`${meta.label} 작업 상세 열기`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_STYLE[task.type]}`}>
            {meta.icon} {meta.label}
          </span>
          {task.overdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
              ⏰ 지연
            </span>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {task.vehicle.modelName} {task.vehicle.plateNo}
          </span>
        </div>

        <p className="mt-2 flex items-center gap-1 text-sm font-semibold">
          <span className="truncate">{task.from.label}</span>
          <span className="text-gray-400">→</span>
          <span className="truncate text-sky-600">{task.to.label}</span>
        </p>

        <p className="mt-1 text-xs text-gray-500">
          <span className={task.overdue ? 'font-semibold text-red-500' : ''}>
            {withDate ? fmtDateTime(task.dueAt) : fmtTime(task.dueAt)}까지
          </span>
          {task.etaMinutes !== null && <span> · 이동 약 {task.etaMinutes}분</span>}
        </p>
      </button>

      {quickAction && (
        <button
          type="button"
          onClick={quickAction.onClick}
          disabled={quickAction.busy}
          className="mt-3 w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {quickAction.busy ? '처리 중...' : quickAction.label}
        </button>
      )}
    </div>
  );
}
