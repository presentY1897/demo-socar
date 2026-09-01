'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  createOpsVehicleSchema,
  fuelTypeSchema,
  type OpsZoneRes,
  type PricingPlanRes,
} from '@socar/shared';
import { api, ApiError, swrFetcher } from '@/lib/api';
import { FUEL_LABEL, krw, kstIso } from '@/lib/format';
import { ErrorNote, FormField, inputClass } from './primitives';

/**
 * 신규 차량 등록 — 차량 + 도입 원가 + 보험을 한 폼에서 받는다.
 *
 * 도입/보험을 나중에 채우는 형태로 두면 회계 탭의 비용이 조용히 비게 된다(M3-3 서비스가
 * 셋을 한 트랜잭션으로 만드는 이유와 같다). 검증은 서버와 같은 zod 스키마로 미리 돌려서
 * "구매인데 취득가가 없다" 같은 조합 오류를 왕복 없이 그 자리에 띄운다.
 */
export function VehicleCreateForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { data: zones } = useSWR<OpsZoneRes[]>('/ops/zones', swrFetcher);
  const { data: plans } = useSWR<PricingPlanRes[]>('/ops/plans', swrFetcher);

  const [modelName, setModelName] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [fuel, setFuel] = useState<string>('GASOLINE');
  const [seats, setSeats] = useState('5');
  const [zoneId, setZoneId] = useState('');
  const [planId, setPlanId] = useState('');
  const [acquisitionType, setAcquisitionType] = useState<'PURCHASE' | 'LEASE'>('PURCHASE');
  const [acquisitionCostKrw, setAcquisitionCostKrw] = useState('');
  const [monthlyLeaseKrw, setMonthlyLeaseKrw] = useState('');
  const [insurerName, setInsurerName] = useState('');
  const [insurancePremiumKrw, setInsurancePremiumKrw] = useState('');
  const [insuranceExpiresAt, setInsuranceExpiresAt] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createOpsVehicleSchema.safeParse({
      modelName,
      plateNo,
      fuel,
      seats: Number(seats),
      zoneId,
      planId,
      acquisitionType,
      acquisitionCostKrw: acquisitionType === 'PURCHASE' ? num(acquisitionCostKrw) : undefined,
      monthlyLeaseKrw: acquisitionType === 'LEASE' ? num(monthlyLeaseKrw) : undefined,
      insurerName,
      insurancePremiumKrw: num(insurancePremiumKrw),
      // 만기는 날짜만 받는다 — 보험은 그 날 자정에 끝난다
      insuranceExpiresAt: insuranceExpiresAt ? kstIso(insuranceExpiresAt, '00:00') : '',
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        next[key] ??= issue.message;
      }
      setFieldErrors(next);
      setError('입력값을 확인해 주세요');
      return;
    }

    setFieldErrors({});
    setBusy(true);
    try {
      const created = await api<{ id: string }>('/ops/vehicles', {
        method: 'POST',
        body: parsed.data,
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '등록에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="신규 차량 등록" className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="차종" error={fieldErrors.modelName}>
          <input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="아반떼"
            className={inputClass}
          />
        </FormField>
        <FormField label="차량 번호" error={fieldErrors.plateNo}>
          <input
            value={plateNo}
            onChange={(e) => setPlateNo(e.target.value)}
            placeholder="12가 3456"
            className={inputClass}
          />
        </FormField>
        <FormField label="연료" error={fieldErrors.fuel}>
          <select value={fuel} onChange={(e) => setFuel(e.target.value)} className={inputClass}>
            {fuelTypeSchema.options.map((f) => (
              <option key={f} value={f}>
                {FUEL_LABEL[f]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="좌석" error={fieldErrors.seats}>
          <input
            type="number"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className={inputClass}
          />
        </FormField>
        <FormField label="배정 존" error={fieldErrors.zoneId}>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputClass}>
            <option value="">선택하세요</option>
            {zones?.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} (잔여 {z.freeSlots})
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="요금제" error={fieldErrors.planId}>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass}>
            <option value="">선택하세요</option>
            {plans?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · 시간당 {krw(p.baseHourlyKrw)}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <fieldset className="rounded-lg bg-gray-50 p-2">
        <legend className="px-1 text-xs text-gray-500">도입</legend>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="도입 방식">
            <select
              value={acquisitionType}
              onChange={(e) => setAcquisitionType(e.target.value as 'PURCHASE' | 'LEASE')}
              className={inputClass}
            >
              <option value="PURCHASE">구매</option>
              <option value="LEASE">리스</option>
            </select>
          </FormField>
          {acquisitionType === 'PURCHASE' ? (
            <FormField label="취득가(원)" error={fieldErrors.acquisitionCostKrw}>
              <input
                type="number"
                value={acquisitionCostKrw}
                onChange={(e) => setAcquisitionCostKrw(e.target.value)}
                className={inputClass}
              />
            </FormField>
          ) : (
            <FormField label="월 리스료(원)" error={fieldErrors.monthlyLeaseKrw}>
              <input
                type="number"
                value={monthlyLeaseKrw}
                onChange={(e) => setMonthlyLeaseKrw(e.target.value)}
                className={inputClass}
              />
            </FormField>
          )}
        </div>
      </fieldset>

      <fieldset className="rounded-lg bg-gray-50 p-2">
        <legend className="px-1 text-xs text-gray-500">보험</legend>
        <div className="grid grid-cols-3 gap-2">
          <FormField label="보험사" error={fieldErrors.insurerName}>
            <input
              value={insurerName}
              onChange={(e) => setInsurerName(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="보험료(원)" error={fieldErrors.insurancePremiumKrw}>
            <input
              type="number"
              value={insurancePremiumKrw}
              onChange={(e) => setInsurancePremiumKrw(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="보험 만기" error={fieldErrors.insuranceExpiresAt}>
            <input
              type="date"
              value={insuranceExpiresAt}
              onChange={(e) => setInsuranceExpiresAt(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>
      </fieldset>

      {error && <ErrorNote>{error}</ErrorNote>}

      <button
        disabled={busy}
        className="w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? '등록 중...' : '차량 등록'}
      </button>
    </form>
  );
}
