'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  CORP_GRADES,
  CORP_GRADE_DESCRIPTIONS,
  CORP_GRADE_LABELS,
  type CorpGrade,
  type CorpMemberRes,
} from '@socar/shared';
import { BizPermissionGate } from '@/components/BizPermissionGate';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { fmtDate } from '@/lib/format';

/** 본인 행을 잠그는 이유 — 툴팁과 안내 문구가 같은 문장을 쓴다 */
const SELF_LOCK_REASON =
  '본인 등급은 바꿀 수 없어요. 법인에 관리자가 0명이 되는 걸 막기 위해서예요';

export default function BizMembersPage() {
  return (
    <BizPermissionGate permission="manageMembers">
      <MembersView />
    </BizPermissionGate>
  );
}

function MembersView() {
  const { data: members, mutate } = useSWR<CorpMemberRes[]>('/biz/members', swrFetcher);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function changeGrade(member: CorpMemberRes, grade: CorpGrade) {
    setSavingId(member.id);
    setError(null);
    try {
      await api<CorpMemberRes>(`/biz/members/${member.id}/grade`, {
        method: 'PATCH',
        body: { grade },
      });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '등급 변경에 실패했습니다');
      await mutate(); // 실패 시 화면이 서버 상태와 어긋나지 않게 되돌린다
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h1 className="text-xl font-bold">멤버</h1>
      <p className="mt-1 text-sm text-slate-500">
        법인 멤버의 등급을 바꾸면 다음 요청부터 바로 적용돼요
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {members?.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">멤버가 없어요</p>
        )}
        {members?.map((m) => (
          <div key={m.id} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {m.name}
                  {m.isSelf && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      나
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-400">{m.email}</p>
                <p className="mt-0.5 text-[10px] text-slate-300">가입 {fmtDate(m.createdAt)}</p>
              </div>
              <select
                aria-label={`${m.name} 등급`}
                value={m.corpGrade}
                disabled={m.isSelf || savingId === m.id}
                title={m.isSelf ? SELF_LOCK_REASON : undefined}
                onChange={(e) => changeGrade(m, e.target.value as CorpGrade)}
                className="shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              >
                {CORP_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {CORP_GRADE_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>
            {m.isSelf && <p className="mt-1.5 text-[11px] text-slate-400">{SELF_LOCK_REASON}</p>}
          </div>
        ))}
      </div>

      {/* 등급이 무엇을 여는지 — 드롭다운을 고르기 전에 보이도록 */}
      <dl className="mt-6 rounded-xl bg-white p-4 text-xs shadow-sm">
        <p className="mb-2 text-sm font-semibold text-slate-700">등급 안내</p>
        {CORP_GRADES.map((g) => (
          <div key={g} className="flex gap-2 py-0.5">
            <dt className="w-14 shrink-0 font-medium text-slate-600">{CORP_GRADE_LABELS[g]}</dt>
            <dd className="text-slate-400">{CORP_GRADE_DESCRIPTIONS[g]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
