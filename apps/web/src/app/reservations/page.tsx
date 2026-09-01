'use client';

import Link from 'next/link';
import useSWR from 'swr';
import type { ReservationStatusValue } from '@socar/shared';
import { ExportButtons } from '@/components/ExportButtons';
import { swrFetcher } from '@/lib/api';
import { fmtDateTime, krw, RESERVATION_STATUS_LABEL } from '@/lib/format';
import { useSession } from '@/lib/session';

interface ReservationRow {
  id: string;
  startAt: string;
  endAt: string;
  status: ReservationStatusValue;
  totalUpfrontKrw: number;
  vehicle: { modelName: string; plateNo: string; zone: { name: string } };
  returnZone: { name: string } | null;
  deliveryLabel: string | null;
  rental: { status: string } | null;
}

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: 'bg-sky-100 text-sky-700',
  IN_USE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
  CANCELED: 'bg-red-50 text-red-400',
};

export default function ReservationsPage() {
  const { user, ready } = useSession();
  const { data } = useSWR<ReservationRow[]>(user ? '/reservations/mine' : null, swrFetcher);

  if (ready && !user) {
    return <p className="py-16 text-center text-sm text-gray-400">로그인 후 이용할 수 있어요</p>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">내 예약</h1>
        {/* 이용 내역을 파일로 (M4-4) — 조회와 같은 엔드포인트라 목록에 보이는 것만 나간다 */}
        {data && data.length > 0 && (
          <ExportButtons path="/reservations/mine" label="내예약" />
        )}
      </div>
      <div className="mt-4 space-y-3">
        {data?.length === 0 && (
          <p className="py-16 text-center text-sm text-gray-400">
            아직 예약이 없어요.{' '}
            <Link href="/" className="text-sky-500 underline">
              지도에서 차량 찾기
            </Link>
          </p>
        )}
        {data?.map((r) => (
          <Link
            key={r.id}
            href={`/reservations/${r.id}`}
            className="block rounded-xl bg-white p-4 shadow-sm hover:ring-1 hover:ring-sky-300"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold">
                {r.vehicle.modelName}
                <span className="ml-2 text-xs font-normal text-gray-400">{r.vehicle.plateNo}</span>
              </p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                {RESERVATION_STATUS_LABEL[r.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {fmtDateTime(r.startAt)} ~ {fmtDateTime(r.endAt)}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {r.deliveryLabel ? (
                <span className="text-indigo-500">🚚 부름: {r.deliveryLabel}</span>
              ) : (
                <>
                  {r.vehicle.zone.name}
                  {r.returnZone && <span className="text-indigo-500"> → {r.returnZone.name} (편도)</span>}
                </>
              )}
              {' · '}
              {krw(r.totalUpfrontKrw)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
