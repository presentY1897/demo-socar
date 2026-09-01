'use client';

import { useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import type { DispatchBoardRes } from '@socar/shared';
import { BizPermissionGate } from '@/components/BizPermissionGate';
import { swrFetcher } from '@/lib/api';
import { DISPATCH_STATUS_LABEL, fmtTime, todayKst } from '@/lib/format';
import { useSession } from '@/lib/session';

/** KST 하루 기준 위치(%) */
function pos(date: string, iso: string) {
  const dayStart = dayjs(`${date}T00:00:00+09:00`);
  const h = dayjs(iso).diff(dayStart, 'minute') / 60;
  return Math.max(0, Math.min(24, h)) / 24 * 100;
}

export default function BoardPage() {
  // 탭을 숨겨도 URL로는 들어올 수 있다 — 권한 판정은 게이트가 API와 같은 기준으로 한다
  return (
    <BizPermissionGate permission="viewBoard">
      <BoardView />
    </BizPermissionGate>
  );
}

function BoardView() {
  const { user } = useSession();
  const [date, setDate] = useState(todayKst());
  const { data } = useSWR<DispatchBoardRes>(
    user ? `/biz/dispatch/board?date=${date}` : null,
    swrFetcher,
    { refreshInterval: 15000 },
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">배차 타임라인</h1>
          <p className="text-sm text-gray-500">{data?.office.name} 인근 3km 차량</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      {/* 대기 중 요청 */}
      {data && data.requests.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {data.requests.map((r) => (
            <div key={r.id} className="min-w-44 shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs">
              <p className="font-semibold">{r.purpose}</p>
              <p className="text-gray-500">
                {fmtTime(r.desiredStartAt)}~{fmtTime(r.desiredEndAt)} · {r.requester.name}
              </p>
              <p className="mt-0.5 text-amber-600">{DISPATCH_STATUS_LABEL[r.status]}</p>
            </div>
          ))}
        </div>
      )}

      {/* 타임라인 */}
      <div className="mt-4 overflow-x-auto rounded-xl bg-white p-4 shadow-sm">
        <div className="min-w-[640px]">
          {/* 시간 눈금 */}
          <div className="relative ml-36 h-5 border-b border-gray-100">
            {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => (
              <span
                key={h}
                className="absolute -translate-x-1/2 text-[10px] text-gray-400"
                style={{ left: `${(h / 24) * 100}%` }}
              >
                {String(h).padStart(2, '0')}
              </span>
            ))}
          </div>

          {data?.vehicles.map((v) => (
            <div key={v.id} className="flex items-center border-b border-gray-50 py-1.5">
              <div className="w-36 shrink-0 pr-2">
                <p className="truncate text-sm font-medium">{v.modelName}</p>
                <p className="truncate text-[10px] text-gray-400">{v.plateNo} · {v.zone.name}</p>
              </div>
              <div className="relative h-7 flex-1 rounded bg-gray-50">
                {Array.from({ length: 11 }, (_, i) => (i + 1) * 2).map((h) => (
                  <span
                    key={h}
                    className="absolute top-0 h-full w-px bg-gray-100"
                    style={{ left: `${(h / 24) * 100}%` }}
                  />
                ))}
                {v.reservations.map((r) => {
                  const left = pos(date, r.startAt);
                  const width = Math.max(pos(date, r.endAt) - left, 2);
                  const isCorp = !!r.dispatch;
                  return (
                    <div
                      key={r.id}
                      title={`${fmtTime(r.startAt)}~${fmtTime(r.endAt)} ${r.user.name}${r.dispatch ? ` · ${r.dispatch.purpose}` : ''}`}
                      className={`absolute top-0.5 h-6 overflow-hidden rounded px-1 text-[10px] leading-6 text-white ${
                        r.status === 'IN_USE'
                          ? 'bg-green-500'
                          : isCorp
                            ? 'bg-indigo-500'
                            : 'bg-sky-400'
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {r.dispatch ? r.dispatch.purpose : r.user.name}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {data?.vehicles.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">인근에 차량이 없어요</p>
          )}
        </div>
        <div className="mt-3 flex gap-4 text-[11px] text-gray-400">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-400" />일반 예약</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-indigo-500" />법인 배차</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-500" />이용 중</span>
        </div>
      </div>
    </div>
  );
}
