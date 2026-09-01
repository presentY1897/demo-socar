'use client';

import { useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { hasCorpPermission, type DispatchRequestRes } from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { DISPATCH_STATUS_LABEL, fmtDateTime, kstIso, todayKst } from '@/lib/format';
import { useSession } from '@/lib/session';

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: 'bg-gray-100 text-gray-500',
  RECOMMENDED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-50 text-red-500',
  CANCELED: 'bg-gray-100 text-gray-400',
};

const TIMES = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);

export default function BizDispatchPage() {
  const { user } = useSession();
  const { data: requests, mutate } = useSWR<DispatchRequestRes[]>(
    user ? '/biz/dispatch/requests' : null,
    swrFetcher,
  );

  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState(todayKst());
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 승인/반려 노출은 역할이 아니라 등급 권한으로 — shared CORP_PERMISSIONS 단일 소스
  const canApprove = hasCorpPermission(user?.corpGrade, 'approve');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/biz/dispatch/requests', {
        method: 'POST',
        body: {
          purpose,
          desiredStartAt: kstIso(date, startTime),
          desiredEndAt: kstIso(date, endTime),
        },
      });
      setPurpose('');
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  async function decide(requestId: string, action: 'approve' | 'reject', candidateId?: string) {
    setBusy(true);
    setError(null);
    try {
      if (action === 'approve') {
        await api(`/biz/dispatch/requests/${requestId}/approve`, {
          method: 'POST',
          body: { candidateId },
        });
      } else {
        const reason = window.prompt('반려 사유를 입력하세요');
        if (!reason) {
          setBusy(false);
          return;
        }
        await api(`/biz/dispatch/requests/${requestId}/reject`, { method: 'POST', body: { reason } });
      }
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '처리에 실패했습니다');
      await mutate(); // 충돌 시 후보가 갱신되므로 다시 불러온다
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h1 className="text-xl font-bold">배차</h1>
      <p className="mt-1 text-sm text-gray-500">
        {canApprove ? '배차 담당자 — 요청을 검토하고 근거와 함께 결정하세요' : '업무용 차량을 요청하면 담당자가 배정해요'}
      </p>

      {/* 요청 폼 */}
      <form onSubmit={submit} className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">차량 요청</h2>
        <input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="사용 목적 (예: 판교 거래처 미팅)"
          className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <input
            type="date"
            value={date}
            min={todayKst()}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
          />
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
            {TIMES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <span className="self-center text-gray-400">~</span>
          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
            {TIMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button
          disabled={busy || !purpose}
          className="mt-3 w-full rounded-lg bg-sky-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? '처리 중...' : '요청하고 추천받기'}
        </button>
      </form>

      {/* 요청 목록 */}
      <div className="mt-5 space-y-3">
        {requests?.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">아직 배차 요청이 없어요</p>
        )}
        {requests?.map((r) => (
          <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{r.purpose}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                {DISPATCH_STATUS_LABEL[r.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {fmtDateTime(r.desiredStartAt)} ~ {dayjs(r.desiredEndAt).format('HH:mm')}
              {canApprove && <span className="ml-2 text-xs text-gray-400">요청자 {r.requester.name}</span>}
            </p>
            {r.rejectReason && <p className="mt-1 text-xs text-red-400">반려 사유: {r.rejectReason}</p>}

            {r.status === 'RECOMMENDED' && r.candidates.length === 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-600">
                조건에 맞는 차량이 없어요. 시간을 바꿔 다시 요청해 보세요
              </p>
            )}

            {r.candidates.length > 0 && r.status !== 'APPROVED' && r.status !== 'REJECTED' && (
              <div className="mt-3 space-y-2">
                {r.candidates.map((c) => (
                  <div key={c.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        {c.rank}. {c.vehicle.modelName}
                        <span className="ml-1.5 text-xs font-normal text-gray-400">{c.vehicle.plateNo}</span>
                        {c.isDedicated ? (
                          <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                            전용
                          </span>
                        ) : (
                          <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                            공유존
                          </span>
                        )}
                      </p>
                      <span className="text-sm font-bold text-sky-600">{c.score}점</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {c.reasons.map((reason, i) => (
                        <li key={i} className={`text-xs ${reason.startsWith('⚠') ? 'text-amber-600' : 'text-gray-500'}`}>
                          {reason.startsWith('⚠') ? reason : `· ${reason}`}
                        </li>
                      ))}
                    </ul>
                    {canApprove && (
                      <button
                        disabled={busy}
                        onClick={() => decide(r.id, 'approve', c.id)}
                        className="mt-2 w-full rounded-md bg-sky-500 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        이 차량으로 승인
                      </button>
                    )}
                  </div>
                ))}
                {canApprove && (
                  <button
                    disabled={busy}
                    onClick={() => decide(r.id, 'reject')}
                    className="w-full rounded-md border border-red-200 py-1.5 text-xs font-semibold text-red-500 disabled:opacity-40"
                  >
                    요청 반려
                  </button>
                )}
              </div>
            )}

            {r.status === 'APPROVED' && r.reservation && (
              <p className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-700">
                ✓ 예약 생성됨 — 요청자의 &lsquo;내 예약&rsquo;에서 확인할 수 있어요
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
