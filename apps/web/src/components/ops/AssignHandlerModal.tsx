'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  HANDLER_TASK_TYPE_META,
  assignHandlerTaskSchema,
  type HandlerCandidateRes,
  type HandlerTaskRes,
} from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Empty, ErrorNote } from './primitives';

/**
 * 핸들러 배정 모달 — 후보는 **서버가 준 순서 그대로** 보여준다.
 *
 * 순서 근거는 "마지막 완료 지점 → 이 작업 출발지" 거리이고, 점수 대신 근거 문장을 준다
 * (M2-4 handler-recommend). 화면이 다시 정렬하면 근거 문장과 순서가 어긋난다.
 */
export function AssignHandlerModal({
  task,
  onClose,
  onAssigned,
}: {
  task: HandlerTaskRes;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { data: candidates } = useSWR<HandlerCandidateRes[]>(
    `/ops/tasks/${task.id}/candidates`,
    swrFetcher,
  );
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function assign(handlerId: string) {
    const parsed = assignHandlerTaskSchema.safeParse({ handlerId });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusyId(handlerId);
    setError(null);
    try {
      await api(`/ops/tasks/${task.id}/assign`, { method: 'POST', body: parsed.data });
      onAssigned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '배정에 실패했습니다');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/30 p-0 md:items-center md:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="핸들러 배정"
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold">핸들러 배정</h3>
            <p className="truncate text-xs text-gray-400">
              {HANDLER_TASK_TYPE_META[task.type].label} · {task.vehicle.modelName} ·{' '}
              {task.from.label} → {task.to.label}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-xs text-gray-400">
            닫기
          </button>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <ol className="mt-3 space-y-2">
          {candidates?.length === 0 && <Empty>배정 가능한 핸들러가 없어요</Empty>}
          {candidates?.map((c, i) => (
            <li key={c.handlerId} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="mr-1.5 text-xs text-gray-400">{i + 1}</span>
                    {c.name}
                  </p>
                  {/* 근거는 목록 마크업으로 두지 않는다 — 후보 목록(ol) 안에 목록이 겹치면
                      "몇 번째 후보"라는 순서 정보가 흐려진다 */}
                  <div className="mt-0.5 space-y-0.5">
                    {c.reasons.map((r) => (
                      <p key={r} className="text-[11px] text-gray-500">
                        · {r}
                      </p>
                    ))}
                  </div>
                  {c.lastCompletedAt && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      마지막 완료 {fmtDateTime(c.lastCompletedAt)}
                    </p>
                  )}
                </div>
                <button
                  disabled={busyId !== null}
                  onClick={() => assign(c.handlerId)}
                  className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  배정
                </button>
              </div>
            </li>
          ))}
          {!candidates && <Empty>후보를 불러오는 중...</Empty>}
        </ol>
      </div>
    </div>
  );
}
