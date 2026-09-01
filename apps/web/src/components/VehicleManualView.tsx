'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import type { VehicleManualRes } from '@socar/shared';
import { ApiError, swrFetcher } from '@/lib/api';
import { FUEL_LABEL } from '@/lib/format';

/** 차종별 매뉴얼 (M1-6) — 섹션 아코디언. 콘텐츠는 API의 정적 데이터가 진실이다 */
export function VehicleManualView({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<VehicleManualRes>(
    `/vehicles/${id}/manual`,
    swrFetcher,
  );
  // 첫 섹션(시동)은 펼친 채로 — 차에 타서 가장 먼저 보는 항목이다
  const [openIndex, setOpenIndex] = useState(0);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-gray-500">
          {error instanceof ApiError ? error.message : '매뉴얼을 불러오지 못했어요'}
        </p>
        <button
          onClick={() => router.back()}
          className="mt-4 rounded-lg bg-sky-500 px-6 py-2 text-sm font-semibold text-white"
        >
          뒤로 가기
        </button>
      </div>
    );
  }

  if (isLoading || !data) {
    return <p className="py-16 text-center text-sm text-gray-400">불러오는 중...</p>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <button onClick={() => router.back()} className="text-sm text-gray-400">← 뒤로</button>

      <div className="mt-2 rounded-xl bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold text-sky-600">차종 매뉴얼</p>
        <h1 className="mt-0.5 text-lg font-bold">
          {data.modelName}
          <span className="ml-2 text-sm font-normal text-gray-400">{data.plateNo}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-600">{data.tagline}</p>
        <span className="mt-2 inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
          {FUEL_LABEL[data.fuel] ?? data.fuel}
        </span>
      </div>

      <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
        {data.sections.map((section, i) => {
          const open = openIndex === i;
          return (
            <div key={section.title}>
              <button
                aria-expanded={open}
                onClick={() => setOpenIndex(open ? -1 : i)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className={`text-sm ${open ? 'font-bold text-sky-600' : 'font-medium'}`}>
                  {section.title}
                </span>
                <span className="text-xs text-gray-300">{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <p className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-gray-600">
                  {section.body}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[11px] text-gray-400">
        데모용 모의 매뉴얼이에요 · 실제 조작은 차량 내 매뉴얼을 따르세요
      </p>
    </div>
  );
}
