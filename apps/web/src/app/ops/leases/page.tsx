'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { LEASE_STATUS_LABELS, isLeasePending, type OpsLeaseRes } from '@socar/shared';
import { LeaseDDayBadge } from '@/components/LeaseDDayBadge';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { fmtDate, krw } from '@/lib/format';
import { useSession } from '@/lib/session';

/**
 * 운영 어드민의 리스 요청 처리 — 법인이 낸 연장/해지 요청을 승인/반려한다.
 *
 * M3 백오피스가 붙기 전의 최소 화면이다. 백오피스가 생기면 이 목록이 그 탭의
 * 소섹션으로 들어간다 (작업 문서 M5-5).
 */
export default function OpsLeasesPage() {
  const { user, ready } = useSession();
  const isOps = user?.role === 'OPS_ADMIN';
  const { data, mutate } = useSWR<OpsLeaseRes[]>(isOps ? '/ops/leases' : null, swrFetcher);

  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (ready && !isOps) {
    return <p className="py-16 text-center text-sm text-gray-400">운영 어드민 계정으로 로그인하세요</p>;
  }

  async function decide(lease: OpsLeaseRes, action: 'approve' | 'reject') {
    let body: Record<string, string> = {};
    if (action === 'reject') {
      const reason = window.prompt('반려 사유를 입력하세요');
      if (!reason) return;
      body = { reason };
    }
    setBusyId(lease.id);
    setError(null);
    try {
      await api(`/ops/leases/${lease.id}/${action}`, { method: 'POST', body });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '처리에 실패했습니다');
      await mutate(); // 다른 담당자가 먼저 처리했을 수 있어 다시 읽는다
    } finally {
      setBusyId(null);
    }
  }

  const pending = data?.filter((l) => isLeasePending(l.status)) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <h1 className="text-xl font-bold">리스 계약</h1>
      <p className="mt-1 text-sm text-gray-500">
        법인이 낸 연장·해지 요청을 처리해요 · 처리 대기 {pending.length}건
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {data?.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">리스 계약이 없어요</p>
        )}
        {data?.map((l) => (
          <div key={l.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{l.corporation.name}</p>
                <p className="truncate text-xs text-gray-400">
                  {l.vehicle.modelName} · {l.vehicle.plateNo}
                </p>
              </div>
              <LeaseDDayBadge lease={l} />
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              <span>월 {krw(l.monthlyFeeKrw)}</span>
              <span>
                {fmtDate(l.startAt)} ~ {fmtDate(l.endAt)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-semibold ${
                  isLeasePending(l.status)
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {LEASE_STATUS_LABELS[l.status]}
              </span>
            </div>

            {isLeasePending(l.status) && (
              <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                {l.requestedEndAt && <p>희망 만기 {fmtDate(l.requestedEndAt)}</p>}
                {l.requestedBy && <p>요청자 {l.requestedBy.name}</p>}
                {l.requestNote && <p>메모: {l.requestNote}</p>}
              </div>
            )}

            {isLeasePending(l.status) && (
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busyId === l.id}
                  onClick={() => decide(l, 'approve')}
                  className="flex-1 rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  승인
                </button>
                <button
                  disabled={busyId === l.id}
                  onClick={() => decide(l, 'reject')}
                  className="flex-1 rounded-lg border border-red-200 py-2 text-sm font-semibold text-red-500 disabled:opacity-40"
                >
                  반려
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
