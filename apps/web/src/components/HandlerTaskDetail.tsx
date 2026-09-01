'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import {
  completeHandlerTaskSchema,
  HANDLER_TASK_STATUS_META,
  HANDLER_TASK_TYPE_META,
  type CompleteHandlerTaskDto,
  type HandlerTaskRes,
  type PhotoInput,
} from '@socar/shared';
import { fmtDateTime } from '@/lib/format';
import { PhotoCapture } from './PhotoCapture';

const TaskRouteMap = dynamic(() => import('./TaskRouteMap'), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse rounded-lg bg-gray-100" />,
});

interface Props {
  task: HandlerTaskRes;
  onClose: () => void;
  onAccept: () => Promise<void>;
  onStart: () => Promise<void>;
  onComplete: (dto: CompleteHandlerTaskDto) => Promise<void>;
}

/**
 * 작업 상세 — 지도로 "어디서 어디로"를 보여주고, 지금 누를 수 있는 버튼 하나를 크게 둔다.
 *
 * 상태마다 다음 동작이 하나뿐이라(수락 → 이동 시작 → 완료) 버튼을 나란히 늘어놓지 않는다.
 * 완료 입력은 제출 전에 서버와 같은 shared 스키마로 검증한다 — 현장에서 사진을 다 찍고
 * 400을 받는 것보다 버튼을 누른 자리에서 부족한 항목을 알려주는 편이 낫다.
 */
export function HandlerTaskDetail({ task, onClose, onAccept, onStart, onComplete }: Props) {
  const meta = HANDLER_TASK_TYPE_META[task.type];
  const [photos, setPhotos] = useState<PhotoInput[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했어요');
    } finally {
      setBusy(false);
    }
  }

  function submitComplete() {
    const parsed = completeHandlerTaskSchema.safeParse({ note: note.trim(), photos });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    void run(() => onComplete(parsed.data));
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label="작업 상세"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {meta.icon} {meta.label}
            <span className="ml-2 text-xs font-medium text-gray-400">
              {HANDLER_TASK_STATUS_META[task.status].label}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500"
          >
            닫기
          </button>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">{meta.description}</p>

        <div className="mt-3">
          <TaskRouteMap from={task.from} to={task.to} />
        </div>

        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="출발">{task.from.label}</Row>
          <Row label="도착">{task.to.label}</Row>
          <Row label="차량">
            {task.vehicle.modelName} · {task.vehicle.plateNo}
          </Row>
          <Row label="기한">
            <span className={task.overdue ? 'font-semibold text-red-500' : ''}>
              {fmtDateTime(task.dueAt)}
              {task.overdue && ' (지연)'}
            </span>
          </Row>
          {task.etaMinutes !== null && (
            <Row label="예상 이동">
              약 {task.etaMinutes}분
              {task.distanceMeters !== null && ` · ${(task.distanceMeters / 1000).toFixed(1)}km`}
            </Row>
          )}
          {task.completedAt && <Row label="완료">{fmtDateTime(task.completedAt)}</Row>}
          {task.completionNote && <Row label="인계 메모">{task.completionNote}</Row>}
        </dl>

        {task.status === 'EN_ROUTE' && (
          <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-3">
            <PhotoCapture
              value={photos}
              onChange={setPhotos}
              label="인계 사진"
              hint="차를 둔 자리와 주변 표지가 보이게 찍어 주세요"
            />
            <div>
              <label htmlFor="task-note" className="text-sm font-medium">
                인계 메모
              </label>
              <textarea
                id="task-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="예: 지하 2층 B-14, 충전 케이블 연결 완료"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}

        <div className="mt-4">
          {task.status === 'PENDING' && (
            <ActionButton busy={busy} onClick={() => void run(onAccept)}>
              작업 수락
            </ActionButton>
          )}
          {task.status === 'ASSIGNED' && (
            <ActionButton busy={busy} onClick={() => void run(onStart)}>
              이동 시작
            </ActionButton>
          )}
          {task.status === 'EN_ROUTE' && (
            <ActionButton busy={busy} onClick={submitComplete}>
              완료 처리
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-gray-400">{label}</dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}

function ActionButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="w-full rounded-xl bg-sky-500 py-3 text-base font-bold text-white disabled:opacity-50"
    >
      {busy ? '처리 중...' : children}
    </button>
  );
}
