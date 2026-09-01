'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  HANDLER_TASK_STATUS_META,
  HANDLER_TASK_TYPE_META,
  type HandlerTaskRes,
} from '@socar/shared';
import { swrFetcher } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { buildTaskBoard } from '@/lib/ops-tasks';
import { AssignHandlerModal } from './AssignHandlerModal';
import { RepositionForm } from './RepositionForm';
import { Empty, Panel } from './primitives';

/**
 * ③ 작업/배차 — 핸들러 배정을 화면으로 올린다 (피드백 #5 "운송기사 배차").
 *
 * 작업 목록은 한 번만 받아 세 덩어리(미배정 큐 · 진행 중 보드 · 오늘 처리량)로 가른다.
 * 상태별로 세 번 물으면 세 목록이 서로 다른 시점의 스냅샷이 되어 합계가 맞지 않는다.
 */
export function OpsDispatchTab() {
  const { data, mutate } = useSWR<HandlerTaskRes[]>('/ops/tasks', swrFetcher);
  const [assigning, setAssigning] = useState<HandlerTaskRes | null>(null);
  const [creating, setCreating] = useState(false);

  const board = useMemo(() => buildTaskBoard(data ?? []), [data]);

  return (
    <div className="space-y-4">
      <Panel
        title="미배정 작업"
        action={
          <span className="text-[11px] text-gray-400">
            {data ? `${board.unassigned.length}건` : '불러오는 중'}
            {board.overdueCount > 0 && (
              <span className="ml-1.5 font-semibold text-red-500">지연 {board.overdueCount}</span>
            )}
          </span>
        }
      >
        <ul className="mt-2 space-y-2">
          {data && board.unassigned.length === 0 && <Empty>배정을 기다리는 작업이 없어요</Empty>}
          {board.unassigned.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 p-3"
            >
              <TaskSummary task={t} />
              <button
                onClick={() => setAssigning(t)}
                className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white"
              >
                배정
              </button>
            </li>
          ))}
          {!data && <Empty>작업을 불러오는 중...</Empty>}
        </ul>
      </Panel>

      <Panel
        title="진행 중"
        action={<span className="text-[11px] text-gray-400">{board.inProgress.length}건</span>}
      >
        <ul className="mt-2 space-y-2">
          {data && board.inProgress.length === 0 && <Empty>진행 중인 작업이 없어요</Empty>}
          {board.inProgress.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 p-3"
            >
              <TaskSummary task={t} />
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium">{t.assigneeName ?? '—'}</p>
                <p className="text-[11px] text-gray-400">
                  {HANDLER_TASK_STATUS_META[t.status].label}
                </p>
                {/* 이동을 시작하기 전이면 담당자를 바꿀 수 있다 (M2-4 전이 규칙) */}
                {t.status === 'ASSIGNED' && (
                  <button
                    onClick={() => setAssigning(t)}
                    className="mt-1 rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-500"
                  >
                    재배정
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="핸들러별 오늘 처리량">
        <ul className="mt-2 divide-y divide-gray-50">
          {board.throughput.length === 0 && <Empty>오늘 배정된 핸들러가 없어요</Empty>}
          {board.throughput.map((h) => (
            <li key={h.handlerId} className="flex items-center justify-between py-1.5 text-sm">
              <span>{h.name}</span>
              <span className="text-xs text-gray-500">
                오늘 완료 <b className="text-gray-700">{h.doneToday}</b> · 진행 중 {h.active}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="재배치 작업 만들기"
        action={
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-600"
          >
            {creating ? '닫기' : '새 작업'}
          </button>
        }
      >
        {creating && (
          <RepositionForm
            onCreated={async () => {
              setCreating(false);
              await mutate();
            }}
          />
        )}
      </Panel>

      {assigning && (
        <AssignHandlerModal
          task={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={async () => {
            setAssigning(null);
            await mutate();
          }}
        />
      )}
    </div>
  );
}

function TaskSummary({ task }: { task: HandlerTaskRes }) {
  const meta = HANDLER_TASK_TYPE_META[task.type];
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-sm">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
          {meta.icon} {meta.label}
        </span>
        <span className="truncate">
          {task.vehicle.modelName}
          <span className="ml-1 text-xs text-gray-400">{task.vehicle.plateNo}</span>
        </span>
      </p>
      <p className="mt-0.5 truncate text-xs text-gray-500">
        {task.from.label} → {task.to.label}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-400">
        기한 {fmtDateTime(task.dueAt)}
        {task.overdue && <span className="ml-1 font-semibold text-red-500">지연</span>}
        {task.etaMinutes !== null && <span className="ml-1">· 예상 {task.etaMinutes}분</span>}
      </p>
    </div>
  );
}
