'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { krw } from '@/lib/format';
import type { ZoneMarker } from '@/components/ZoneMap';

const ZoneMap = dynamic(() => import('@/components/ZoneMap'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-gray-400">지도를 불러오는 중...</div>,
});

interface ZoneDetail {
  id: string;
  name: string;
  address: string;
  region: string;
  vehicles: {
    id: string;
    modelName: string;
    plateNo: string;
    fuel: string;
    seats: number;
    plan: { name: string; baseHourlyKrw: number; weekendHourlyKrw: number; perKmKrw: number };
  }[];
}

const REGION_LABEL: Record<string, string> = {
  seoul: '서울',
  busan: '부산',
  daejeon: '대전',
  jeju: '제주',
};
const FUEL_LABEL: Record<string, string> = { EV: '전기', GASOLINE: '휘발유', HYBRID: '하이브리드' };

export default function HomePage() {
  const { data: zones } = useSWR<(ZoneMarker & { region: string })[]>('/zones', swrFetcher);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: zone } = useSWR<ZoneDetail>(selectedId ? `/zones/${selectedId}` : null, swrFetcher);

  const regions = useMemo(() => {
    const grouped = new Map<string, (ZoneMarker & { region: string })[]>();
    for (const z of zones ?? []) {
      grouped.set(z.region, [...(grouped.get(z.region) ?? []), z]);
    }
    return grouped;
  }, [zones]);

  return (
    <div className="relative" style={{ height: 'calc(100dvh - 7rem)' }}>
      <ZoneMap zones={zones ?? []} selectedId={selectedId} onSelect={setSelectedId} />

      {/* 지역 점프 */}
      <div className="absolute left-3 top-3 z-[1000] flex gap-1.5">
        {[...regions.entries()].map(([region, list]) => (
          <button
            key={region}
            onClick={() => setSelectedId(list[0].id)}
            className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold shadow"
          >
            {REGION_LABEL[region] ?? region}
          </button>
        ))}
      </div>

      {/* 존 상세 바텀시트 */}
      {selectedId && (
        <div className="absolute inset-x-0 bottom-0 z-[1000] max-h-[55%] overflow-y-auto rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)]">
          <div className="sticky top-0 flex items-start justify-between bg-white px-4 pb-2 pt-4">
            <div>
              <h2 className="font-bold">{zone?.name ?? '...'}</h2>
              <p className="text-xs text-gray-500">{zone?.address}</p>
            </div>
            <button onClick={() => setSelectedId(null)} className="p-1 text-gray-400">✕</button>
          </div>
          <div className="space-y-2 px-4 pb-4">
            {zone?.vehicles.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">이용 가능한 차량이 없어요</p>
            )}
            {zone?.vehicles.map((v) => (
              <Link
                key={v.id}
                href={`/book/${v.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 p-3 hover:border-sky-400"
              >
                <div>
                  <p className="font-semibold">
                    {v.modelName}
                    <span className="ml-2 text-xs font-normal text-gray-400">{v.plateNo}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {FUEL_LABEL[v.fuel] ?? v.fuel} · {v.seats}인승 · {v.plan.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-sky-600">{krw(v.plan.baseHourlyKrw)}/시간</p>
                  <p className="text-[11px] text-gray-400">주행 {krw(v.plan.perKmKrw)}/km</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
