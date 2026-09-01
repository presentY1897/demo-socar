'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  answerInquirySchema,
  inquiryStatusSchema,
  type InquiryStatusValue,
  type OpsInquiryRes,
} from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Empty, ErrorNote, Panel } from './primitives';

/**
 * 문의함 — M1-7 이용자 문의의 답변 창구.
 *
 * 답변은 한 번만 받는다(서버가 재답변 409). 덮어쓰면 이용자가 본 문구와 백오피스가 보는
 * 문구가 갈리기 때문이다 — 그래서 답변 완료 건에는 입력창을 아예 두지 않는다.
 */
export function InquiryInbox() {
  const [status, setStatus] = useState<InquiryStatusValue | ''>('OPEN');
  const { data, mutate } = useSWR<OpsInquiryRes[]>(
    status ? `/ops/inquiries?status=${status}` : '/ops/inquiries',
    swrFetcher,
  );

  return (
    <Panel
      title="문의함"
      action={
        <div className="flex gap-1">
          <StatusChip active={status === ''} onClick={() => setStatus('')}>
            전체
          </StatusChip>
          {inquiryStatusSchema.options.map((s) => (
            <StatusChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {INQUIRY_STATUS_LABEL[s]}
            </StatusChip>
          ))}
        </div>
      }
    >
      <ul className="mt-2 space-y-2">
        {data?.length === 0 && <Empty>이 조건에 맞는 문의가 없어요</Empty>}
        {data?.map((i) => (
          <li key={i.id} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-500">
                    {INQUIRY_CATEGORY_LABEL[i.category]}
                  </span>
                  <span className="truncate">
                    {i.user.name} · {fmtDateTime(i.createdAt)}
                  </span>
                </p>
                <p className="mt-1 text-sm">{i.body}</p>
                {i.vehicle && (
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {i.vehicle.modelName} {i.vehicle.plateNo}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                  i.status === 'OPEN' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {INQUIRY_STATUS_LABEL[i.status]}
              </span>
            </div>

            {i.status === 'ANSWERED' ? (
              <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs">
                <p>{i.answer}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {i.answeredBy?.name ?? '운영'} · {i.answeredAt ? fmtDateTime(i.answeredAt) : ''}
                </p>
              </div>
            ) : (
              <AnswerForm inquiry={i} onAnswered={() => mutate()} />
            )}
          </li>
        ))}
        {!data && <Empty>문의를 불러오는 중...</Empty>}
      </ul>
    </Panel>
  );
}

function AnswerForm({ inquiry, onAnswered }: { inquiry: OpsInquiryRes; onAnswered: () => void }) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = answerInquirySchema.safeParse({ answer });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/ops/inquiries/${inquiry.id}/answer`, { method: 'POST', body: parsed.data });
      onAnswered();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '답변 저장에 실패했습니다');
      onAnswered(); // 다른 담당자가 먼저 답했을 수 있어 다시 읽는다
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="문의 답변" className="mt-2">
      <div className="flex gap-2">
        <input
          aria-label="답변 내용"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="답변을 적어 주세요"
          className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
        />
        <button
          disabled={busy}
          className="shrink-0 rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          답변 등록
        </button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
  );
}

function StatusChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2 py-0.5 text-[11px] ${
        active ? 'bg-sky-500 font-semibold text-white' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {children}
    </button>
  );
}
