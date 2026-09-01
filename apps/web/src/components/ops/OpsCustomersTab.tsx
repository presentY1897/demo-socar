'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  INCIDENT_STATUS_LABEL,
  USER_RISK_WINDOW_DAYS,
  type OpsUserDetailRes,
  type OpsUserRiskRes,
} from '@socar/shared';
import { ExportButtons } from '@/components/ExportButtons';
import { swrFetcher } from '@/lib/api';
import { RESERVATION_STATUS_LABEL, fmtDateTime } from '@/lib/format';
import { riskBadges } from '@/lib/ops-users';
import { InquiryInbox } from './InquiryInbox';
import { Empty, Panel } from './primitives';

/**
 * ⑤ 고객 — "지금 신경 써야 할 이용자"와 "답변을 기다리는 문의" 둘만 둔다.
 *
 * 리스크 목록은 임계치를 넘은 유저만 서버가 실어 준다(모델 없이 집계). 화면은 점수를
 * 보여주지 않는다 — 점수는 순위를 만드는 값일 뿐 사람이 읽는 값이 아니다.
 */
export function OpsCustomersTab({ targetId }: { targetId?: string | null }) {
  const { data: users } = useSWR<OpsUserRiskRes[]>('/ops/users/risk', swrFetcher);
  const [openId, setOpenId] = useState<string | null>(null);

  // 지연 반납 경고에서 넘어온 유저를 바로 펼친다 (서버가 준 targetId)
  useEffect(() => {
    if (targetId) setOpenId(targetId);
  }, [targetId]);

  return (
    <div className="space-y-4">
      <Panel
        title="유의 유저"
        action={
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">
              최근 {USER_RISK_WINDOW_DAYS}일 기준 {users ? `${users.length}명` : ''}
            </span>
            <ExportButtons path="/ops/users/risk" label="유의유저" />
          </span>
        }
      >
        <ul className="mt-2 space-y-2">
          {users?.length === 0 && <Empty>지금은 유의할 유저가 없어요</Empty>}
          {users?.map((u) => {
            const open = u.id === openId;
            return (
              <li key={u.id} className="rounded-lg border border-gray-100">
                <button
                  onClick={() => setOpenId(open ? null : u.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-2 p-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{u.name}</span>
                    <span className="block truncate text-xs text-gray-400">{u.email}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {riskBadges(u).map((b) => (
                      <span
                        key={b.key}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          b.over ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {b.label} {b.count}
                      </span>
                    ))}
                  </span>
                </button>
                {open && <UserHistory userId={u.id} />}
              </li>
            );
          })}
          {!users && <Empty>유저를 불러오는 중...</Empty>}
        </ul>
      </Panel>

      <InquiryInbox />
    </div>
  );
}

/** 유저를 눌렀을 때 여는 최근 예약/사고 이력 */
function UserHistory({ userId }: { userId: string }) {
  const { data } = useSWR<OpsUserDetailRes>(`/ops/users/${userId}`, swrFetcher);

  if (!data) {
    return (
      <div className="border-t border-gray-100 p-3">
        <p className="text-xs text-gray-400">이력을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div aria-label="유저 이력" className="space-y-3 border-t border-gray-100 p-3">
      <div>
        <h4 className="text-xs font-semibold text-gray-500">최근 예약</h4>
        <ul className="mt-1 space-y-1">
          {data.recentReservations.length === 0 && (
            <li className="text-xs text-gray-400">최근 예약이 없어요</li>
          )}
          {data.recentReservations.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                {r.vehicle.modelName} {r.vehicle.plateNo} · {fmtDateTime(r.startAt)}
              </span>
              <span className="shrink-0 text-gray-500">
                {RESERVATION_STATUS_LABEL[r.status] ?? r.status}
                {r.lateMinutes > 0 && (
                  <span className="ml-1 font-semibold text-red-500">
                    {r.lateMinutes}분 지연
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-gray-500">사고 접수</h4>
        <ul className="mt-1 space-y-1">
          {data.recentIncidents.length === 0 && (
            <li className="text-xs text-gray-400">사고 접수 이력이 없어요</li>
          )}
          {data.recentIncidents.map((inc) => (
            <li key={inc.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">{inc.description}</span>
              <span className="shrink-0 text-gray-500">
                {INCIDENT_STATUS_LABEL[inc.status]} · {fmtDateTime(inc.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
