'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import dayjs from 'dayjs';
import {
  LEASE_STATUS_LABELS,
  isLeasePending,
  type FleetVehicleDetailRes,
} from '@socar/shared';
import { BizPermissionGate } from '@/components/BizPermissionGate';
import { LeaseDDayBadge } from '@/components/LeaseDDayBadge';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { fmtDate, fmtDateTime, kstIso, krw } from '@/lib/format';

/**
 * 차량 상세. 라우트 파라미터는 `use(params)`가 아니라 `useParams()`로 읽는다 —
 * 클라이언트 전용 화면이라 Promise 프롭을 풀 이유가 없고, React 19는 클라이언트에서
 * 만든 프로미스를 `use`로 못 받아 테스트에서 화면 전체가 서스펜드되기 때문이다.
 */
export default function BizFleetDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <BizPermissionGate permission="manageFleet">
      <FleetDetailView vehicleId={id} />
    </BizPermissionGate>
  );
}

function FleetDetailView({ vehicleId }: { vehicleId: string }) {
  const { data, mutate } = useSWR<FleetVehicleDetailRes>(`/biz/fleet/${vehicleId}`, swrFetcher);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extending, setExtending] = useState(false);
  const [requestedEnd, setRequestedEnd] = useState('');
  const [note, setNote] = useState('');

  const lease = data?.lease ?? null;
  const pending = lease ? isLeasePending(lease.status) : false;

  /** 연장 폼 기본값 — 현재 만기 +1년 */
  function openExtend() {
    if (!lease) return;
    setRequestedEnd(dayjs(lease.endAt).add(1, 'year').format('YYYY-MM-DD'));
    setExtending(true);
    setError(null);
  }

  async function submit(path: string, body: unknown) {
    if (!lease) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/biz/leases/${lease.id}/${path}`, { method: 'POST', body });
      setExtending(false);
      setNote('');
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청에 실패했습니다');
      await mutate(); // 다른 곳에서 상태가 바뀌었을 수 있어 다시 읽는다
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="py-16 text-center text-sm text-slate-400">불러오는 중...</p>;

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <Link href="/biz/fleet" className="text-xs text-slate-400">
        ← 플릿
      </Link>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{data.modelName}</h1>
          <p className="text-sm text-slate-500">
            {data.plateNo} · {data.zone.name}
          </p>
        </div>
        {lease && <LeaseDDayBadge lease={lease} />}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {/* 계약 정보 */}
      <section className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">리스 계약</h2>
        {lease ? (
          <>
            <dl className="mt-2 space-y-1 text-sm">
              <Row label="월 리스료" value={krw(lease.monthlyFeeKrw)} />
              <Row label="계약 기간" value={`${fmtDate(lease.startAt)} ~ ${fmtDate(lease.endAt)}`} />
              <Row label="상태" value={LEASE_STATUS_LABELS[lease.status]} />
            </dl>

            {pending ? (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                <p className="font-semibold">
                  {LEASE_STATUS_LABELS[lease.status]} — 운영 담당자 처리를 기다리고 있어요
                </p>
                {lease.requestedEndAt && <p className="mt-0.5">희망 만기 {fmtDate(lease.requestedEndAt)}</p>}
                {lease.requestedBy && lease.requestedAt && (
                  <p className="mt-0.5">
                    {lease.requestedBy.name} · {fmtDate(lease.requestedAt)} 요청
                  </p>
                )}
                {lease.requestNote && <p className="mt-0.5">메모: {lease.requestNote}</p>}
              </div>
            ) : (
              lease.requestNote && (
                <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                  최근 메모: {lease.requestNote}
                </p>
              )
            )}

            {/* 연장/해지 요청 — 처리 대기 중이면 새 요청을 막는다 */}
            {lease.status !== 'ENDED' && (
              <div className="mt-3 flex gap-2">
                <button
                  disabled={busy || pending}
                  onClick={openExtend}
                  className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  연장 요청
                </button>
                <button
                  disabled={busy || pending}
                  onClick={() => {
                    if (!window.confirm('이 계약의 해지를 요청할까요?')) return;
                    void submit('terminate-request', { note: note || undefined });
                  }}
                  className="flex-1 rounded-lg border border-red-200 py-2 text-sm font-semibold text-red-500 disabled:opacity-40"
                >
                  해지 요청
                </button>
              </div>
            )}

            {extending && (
              <form
                className="mt-3 rounded-lg border border-slate-200 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit('extend-request', {
                    requestedEndAt: kstIso(requestedEnd, '00:00'),
                    note: note || undefined,
                  });
                }}
              >
                <label className="text-xs text-slate-500" htmlFor="requestedEnd">
                  희망 만기
                </label>
                <input
                  id="requestedEnd"
                  type="date"
                  value={requestedEnd}
                  min={dayjs(lease.endAt).add(1, 'day').format('YYYY-MM-DD')}
                  onChange={(e) => setRequestedEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="메모 (선택)"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <button
                  disabled={busy || !requestedEnd}
                  className="mt-2 w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busy ? '보내는 중...' : '연장 요청 보내기'}
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-400">진행 중인 리스 계약이 없어요</p>
        )}
      </section>

      {/* 이용 현황 */}
      <section className="mt-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">최근 {data.usage.windowDays}일 이용</h2>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          <Stat label="이용률" value={`${data.usage.utilizationPct}%`} />
          <Stat label="이용일" value={`${data.usage.usedDays}일`} />
          <Stat label="운행" value={`${data.usage.tripCount}회`} />
          <Stat label="주행" value={`${data.usage.distanceKm}km`} />
        </div>

        {data.memberUsage.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {data.memberUsage.map((m) => (
              <li key={m.id} className="flex justify-between text-slate-500">
                <span>{m.name}</span>
                <span>
                  {m.tripCount}회 · {m.totalHours}시간 · {m.distanceKm}km
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 운행일지 */}
      <section className="mt-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">운행일지</h2>
        {data.trips.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">최근 운행 기록이 없어요</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {data.trips.map((t) => (
              <li key={t.id} className="py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{fmtDateTime(t.startAt)}</span>
                  <span className="text-slate-500">{t.user.name}</span>
                </div>
                <p className="text-xs text-slate-400">
                  {t.purpose ? `${t.purpose} · ` : ''}
                  {t.distanceKm !== null ? `${t.distanceKm}km` : '주행 기록 없음'}
                  {t.lateMinutes > 0 && (
                    <span className="ml-1 text-amber-600">지연 {t.lateMinutes}분</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 계약 이력 */}
      <section className="mt-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">계약 이력</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {data.contracts.map((c) => (
            <li key={c.id} className="flex justify-between py-2 text-sm">
              <span>
                {fmtDate(c.startAt)} ~ {fmtDate(c.endAt)}
              </span>
              <span className="text-slate-500">
                {krw(c.monthlyFeeKrw)} · {LEASE_STATUS_LABELS[c.status]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-700">{value}</p>
    </div>
  );
}
