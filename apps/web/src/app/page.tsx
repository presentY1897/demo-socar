'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { krw } from '@/lib/format';
import { defaultRange, durationLabel } from '@/lib/timerange';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import type { ZoneMarker } from '@/components/ZoneMap';

const ZoneMap = dynamic(() => import('@/components/ZoneMap'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-gray-400">지도를 불러오는 중...</div>,
});

interface ZoneVehicle {
  id: string;
  modelName: string;
  plateNo: string;
  fuel: string;
  seats: number;
  estimatedRentalKrw: number;
  plan: { name: string; perKmKrw: number };
}

interface DeliverableVehicle extends ZoneVehicle {
  fromZone: { id: string; name: string };
  deliveryFeeEstimateKrw: number;
  deliveryEtaMinutes: number;
}

interface ZoneDetail {
  id: string;
  name: string;
  address: string;
  region: string;
  lat: number;
  lng: number;
  vehicles: ZoneVehicle[];
  deliverable: DeliverableVehicle[];
}

const REGION_LABEL: Record<string, string> = {
  seoul: '서울',
  busan: '부산',
  daejeon: '대전',
  jeju: '제주',
};
const FUEL_LABEL: Record<string, string> = { EV: '전기', GASOLINE: '휘발유', HYBRID: '하이브리드' };

export default function HomePage() {
  const [range, setRange] = useState(defaultRange);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = `startAt=${encodeURIComponent(range.startAt)}&endAt=${encodeURIComponent(range.endAt)}`;
  const { data: zones } = useSWR<(ZoneMarker & { region: string })[]>(`/zones?${q}`, swrFetcher);
  const { data: zone } = useSWR<ZoneDetail>(
    selectedId ? `/zones/${selectedId}?${q}` : null,
    swrFetcher,
  );

  const regions = useMemo(() => {
    const grouped = new Map<string, (ZoneMarker & { region: string })[]>();
    for (const z of zones ?? []) {
      grouped.set(z.region, [...(grouped.get(z.region) ?? []), z]);
    }
    return grouped;
  }, [zones]);

  const rangeLabel = `${new Date(range.startAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })} ~ ${new Date(range.endAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}`;

  return (
    <div className="relative" style={{ height: 'calc(100dvh - 7rem)' }}>
      <ZoneMap zones={zones ?? []} selectedId={selectedId} onSelect={setSelectedId} />

      {/* 이용 시간 바 — 실제 앱처럼 시간을 먼저 정하고 차량을 찾는다 */}
      <div className="absolute inset-x-3 top-3 z-[1000]">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl bg-white/95 px-4 py-2.5 text-left shadow-lg"
        >
          <div>
            <p className="text-[11px] text-gray-400">이용 시간 ({durationLabel(range.startAt, range.endAt)})</p>
            <p className="text-sm font-semibold">{rangeLabel}</p>
          </div>
          <span className="text-gray-400">{pickerOpen ? '▲' : '▼'}</span>
        </button>
        {pickerOpen && (
          <div className="mt-1.5 rounded-xl bg-white p-3 shadow-lg">
            <TimeRangePicker
              startAt={range.startAt}
              endAt={range.endAt}
              onChange={(startAt, endAt) => setRange({ startAt, endAt })}
            />
            <button
              onClick={() => setPickerOpen(false)}
              className="mt-2 w-full rounded-lg bg-sky-500 py-1.5 text-xs font-semibold text-white"
            >
              이 시간으로 찾기
            </button>
          </div>
        )}
      </div>

      {/* 지역 점프 */}
      <div className="absolute left-3 top-[4.5rem] z-[999] flex gap-1.5">
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
            {zone && zone.vehicles.length === 0 && zone.deliverable.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">이 시간에 이용 가능한 차량이 없어요</p>
            )}

            {/* ① 바로 픽업 */}
            {zone && zone.vehicles.length > 0 && (
              <p className="pt-1 text-xs font-semibold text-gray-500">이 존에서 바로 이용</p>
            )}
            {zone?.vehicles.map((v) => (
              <Link
                key={v.id}
                href={`/book/${v.id}?${q}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 p-3 hover:border-sky-400"
              >
                <div>
                  <p className="font-semibold">
                    {v.modelName}
                    <span className="ml-2 text-xs font-normal text-gray-400">{v.plateNo}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {FUEL_LABEL[v.fuel] ?? v.fuel} · {v.seats}인승 · {v.plan.name}
                    {v.fuel === 'EV' && <span className="ml-1 text-green-600">주행요금 무료</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-sky-600">{krw(v.estimatedRentalKrw)}</p>
                  <p className="text-[11px] text-gray-400">대여요금 · 면책 별도</p>
                </div>
              </Link>
            ))}

            {/* ② 부름으로 가져와 이용 */}
            {zone && zone.deliverable.length > 0 && (
              <p className="pt-2 text-xs font-semibold text-indigo-500">
                🚚 부름으로 가져와 이용 — 다른 존 차량을 배달받아요
              </p>
            )}
            {zone?.deliverable.map((v) => (
              <Link
                key={v.id}
                href={`/book/${v.id}?${q}&dlat=${zone.lat}&dlng=${zone.lng}&dlabel=${encodeURIComponent(`${zone.name} 근처`)}`}
                className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 hover:border-indigo-400"
              >
                <div>
                  <p className="font-semibold">
                    {v.modelName}
                    <span className="ml-2 text-xs font-normal text-gray-400">{v.plateNo}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {v.fromZone.name}에서 배달 · 탁송 약 {v.deliveryEtaMinutes}분
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-indigo-600">
                    {krw(v.estimatedRentalKrw + v.deliveryFeeEstimateKrw)}
                  </p>
                  <p className="text-[11px] text-gray-400">부름 {krw(v.deliveryFeeEstimateKrw)} 포함</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
