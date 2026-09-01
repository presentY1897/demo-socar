'use client';

import { useState } from 'react';
import { updateZoneContractSchema, type OpsZoneRes } from '@socar/shared';
import { api, ApiError } from '@/lib/api';
import { kstIso } from '@/lib/format';
import { ErrorNote, FormField, inputClass } from './primitives';

/** ISO → `<input type="date">` 값 (없으면 빈 칸) */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/**
 * 존 계약 수정 — 계약이 없던 존이면 새로 만든다(서버가 upsert).
 *
 * "유료인데 월 비용 0", "종료일이 시작일보다 앞" 같은 조합은 서버와 같은 zod 스키마로
 * 미리 걸러 그 자리에 띄운다. 무료로 바꾸면 월 비용을 0으로 되돌린다 —
 * 남아 있는 금액이 회계 탭의 주차장 계약비에 그대로 실리면 손익이 조용히 틀어진다.
 */
export function ZoneContractForm({
  zone,
  onSaved,
}: {
  zone: OpsZoneRes;
  onSaved: (updated: OpsZoneRes) => void;
}) {
  const [isPaid, setIsPaid] = useState(zone.contract?.isPaid ?? false);
  const [partnerName, setPartnerName] = useState(zone.contract?.partnerName ?? '');
  const [monthlyFeeKrw, setMonthlyFeeKrw] = useState(String(zone.contract?.monthlyFeeKrw ?? 0));
  const [contractStart, setContractStart] = useState(toDateInput(zone.contract?.contractStart ?? null));
  const [contractEnd, setContractEnd] = useState(toDateInput(zone.contract?.contractEnd ?? null));

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function togglePaid(next: boolean) {
    setIsPaid(next);
    if (!next) setMonthlyFeeKrw('0');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = updateZoneContractSchema.safeParse({
      isPaid,
      partnerName: partnerName.trim() === '' ? null : partnerName,
      monthlyFeeKrw: Number(monthlyFeeKrw || 0),
      contractStart: contractStart ? kstIso(contractStart, '00:00') : null,
      contractEnd: contractEnd ? kstIso(contractEnd, '00:00') : null,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0] ?? 'form')] ??= issue.message;
      setFieldErrors(next);
      // 상세 사유는 해당 칸에 붙는다 — 같은 문장을 위아래로 두 번 보여주지 않는다
      setError('입력값을 확인해 주세요');
      return;
    }

    setFieldErrors({});
    setBusy(true);
    try {
      const updated = await api<OpsZoneRes>(`/ops/zones/${zone.id}/contract`, {
        method: 'PATCH',
        body: parsed.data,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '계약 저장에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={`${zone.name} 계약 수정`} className="mt-2 space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPaid} onChange={(e) => togglePaid(e.target.checked)} />
        유료 계약
      </label>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="계약 파트너">
          <input
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="예: 하이파킹"
            className={inputClass}
          />
        </FormField>
        <FormField label="월 비용(원)" error={fieldErrors.monthlyFeeKrw}>
          <input
            type="number"
            value={monthlyFeeKrw}
            onChange={(e) => setMonthlyFeeKrw(e.target.value)}
            disabled={!isPaid}
            className={inputClass}
          />
        </FormField>
        <FormField label="계약 시작">
          <input
            type="date"
            value={contractStart}
            onChange={(e) => setContractStart(e.target.value)}
            className={inputClass}
          />
        </FormField>
        <FormField label="계약 종료" error={fieldErrors.contractEnd}>
          <input
            type="date"
            value={contractEnd}
            onChange={(e) => setContractEnd(e.target.value)}
            className={inputClass}
          />
        </FormField>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <button
        disabled={busy}
        className="w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? '저장 중...' : '계약 저장'}
      </button>
    </form>
  );
}
