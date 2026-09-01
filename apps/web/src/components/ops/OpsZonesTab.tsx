'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { OpsZoneRes } from '@socar/shared';
import { swrFetcher } from '@/lib/api';
import { fmtDate, krw } from '@/lib/format';
import { ZoneContractForm } from './ZoneContractForm';
import { DDayBadge, Empty, Panel } from './primitives';

/**
 * ④ 존/계약 — "주차장에 돈을 얼마 쓰고 있고, 자리가 남아 있나"에 답한다.
 *
 * 만기 임박(`contract.expiringSoon`)과 잔여 자리는 서버가 판정해 내려준다. 잔여가 음수인
 * 초과 배정도 그대로 보여준다 — 화면에서 0으로 깎으면 그 존으로 차를 계속 보내게 된다.
 */
export function OpsZonesTab({ targetId }: { targetId?: string | null }) {
  const { data, mutate } = useSWR<OpsZoneRes[]>('/ops/zones', swrFetcher);
  const [openId, setOpenId] = useState<string | null>(null);

  // 계약 만료 경고에서 넘어온 존을 바로 펼친다 (서버가 준 targetId)
  useEffect(() => {
    if (targetId) setOpenId(targetId);
  }, [targetId]);

  const expiringCount = data?.filter((z) => z.contract?.expiringSoon).length ?? 0;
  const fullCount = data?.filter((z) => z.freeSlots <= 0).length ?? 0;

  return (
    <Panel
      title="존 · 계약"
      action={
        <span className="text-[11px] text-gray-400">
          {data ? `${data.length}곳 · 만료 임박 ${expiringCount} · 잔여 없음 ${fullCount}` : '불러오는 중'}
        </span>
      }
    >
      <ul className="mt-2 space-y-2">
        {data?.length === 0 && <Empty>등록된 존이 없어요</Empty>}
        {data?.map((z) => {
          const open = z.id === openId;
          return (
            <li key={z.id} className="rounded-lg border border-gray-100">
              <button
                onClick={() => setOpenId(open ? null : z.id)}
                aria-expanded={open}
                className="flex w-full items-start justify-between gap-2 p-3 text-left"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{z.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        z.contract?.isPaid
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {z.contract?.isPaid ? '유료' : '무료'}
                    </span>
                    {z.contract?.contractEnd && z.contract.dDay !== null && (
                      <DDayBadge dDay={z.contract.dDay} soon={z.contract.expiringSoon} label="계약" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-400">{z.address}</span>
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span>{z.contract?.partnerName ?? '파트너 없음'}</span>
                    <span>월 {krw(z.contract?.monthlyFeeKrw ?? 0)}</span>
                    {z.contract?.contractStart && z.contract.contractEnd && (
                      <span>
                        {fmtDate(z.contract.contractStart)} ~ {fmtDate(z.contract.contractEnd)}
                      </span>
                    )}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-xs text-gray-400">
                    면수 {z.capacity} · 배정 {z.assignedCount}
                  </span>
                  <span
                    className={`mt-0.5 block text-sm font-semibold ${
                      z.freeSlots <= 0 ? 'text-red-500' : 'text-gray-700'
                    }`}
                  >
                    잔여 {z.freeSlots}
                  </span>
                  {z.freeSlots <= 0 && (
                    <span className="text-[11px] text-red-500">
                      {z.freeSlots < 0 ? '초과 배정' : '자리 없음'}
                    </span>
                  )}
                </span>
              </button>

              {open && (
                <div className="border-t border-gray-100 p-3">
                  <ZoneContractForm
                    zone={z}
                    onSaved={async (updated) => {
                      // 서버가 돌려준 계약을 목록에 즉시 반영하고 다시 읽는다
                      await mutate(
                        (rows) => rows?.map((row) => (row.id === updated.id ? updated : row)),
                        { revalidate: true },
                      );
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
        {!data && <Empty>존을 불러오는 중...</Empty>}
      </ul>
    </Panel>
  );
}
