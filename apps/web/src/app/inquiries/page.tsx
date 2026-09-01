'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  createInquirySchema,
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  inquiryCategorySchema,
  type InquiryCategoryValue,
  type InquiryRes,
} from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';

const CATEGORIES = inquiryCategorySchema.options;

/** 문의 접수 + 내 문의함. 답변은 운영 백오피스(M3-5)에서 달린다 */
export default function InquiriesPage() {
  const { user, ready } = useSession();
  const { data: inquiries, mutate } = useSWR<InquiryRes[]>(user ? '/me/inquiries' : null, swrFetcher);

  const [category, setCategory] = useState<InquiryCategoryValue>('VEHICLE');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsed = createInquirySchema.safeParse({ category, body });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/inquiries', { method: 'POST', body: parsed.data });
      setBody('');
      await mutate();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '접수에 실패했어요');
    } finally {
      setBusy(false);
    }
  }

  if (ready && !user) {
    return <p className="py-16 text-center text-sm text-gray-400">로그인 후 이용할 수 있어요</p>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h1 className="text-lg font-bold">문의하기</h1>

      <div className="mt-3 space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium">문의 유형</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as InquiryCategoryValue)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {INQUIRY_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">문의 내용</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="차량 상태, 이용 중 불편, 정산 문의 등을 적어 주세요"
            className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="w-full rounded-lg bg-sky-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? '접수 중...' : '문의 접수'}
        </button>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-gray-500">내 문의</h2>
      <div className="mt-2 space-y-2">
        {inquiries?.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">아직 접수한 문의가 없어요</p>
        )}
        {inquiries?.map((inquiry) => (
          <article key={inquiry.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-600">
                {INQUIRY_CATEGORY_LABEL[inquiry.category]}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  inquiry.status === 'ANSWERED'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {INQUIRY_STATUS_LABEL[inquiry.status]}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm">{inquiry.body}</p>
            <p className="mt-1 text-xs text-gray-400">{fmtDateTime(inquiry.createdAt)}</p>
            {inquiry.answer && (
              <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm">
                <p className="text-xs font-semibold text-gray-500">운영팀 답변</p>
                <p className="mt-1 whitespace-pre-wrap">{inquiry.answer}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
