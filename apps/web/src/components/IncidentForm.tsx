'use client';

import { useState } from 'react';
import {
  createIncidentSchema,
  type IncidentResultRes,
  type PhotoInput,
} from '@socar/shared';
import { api, ApiError } from '@/lib/api';
import { krw } from '@/lib/format';
import { PhotoCapture } from './PhotoCapture';

/**
 * 사고 접수(모의).
 *
 * 접수 자체보다 "지금 내 자기부담금이 얼마인가"를 그 자리에서 보여주는 게 핵심이라,
 * 완료 화면이 가입 면책상품과 금액을 먼저 말한다. 실제 보험사 청구 연동은 스코프 아웃(Q5).
 */
export function IncidentForm({ rentalId }: { rentalId: string }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IncidentResultRes | null>(null);

  async function submit() {
    const parsed = createIncidentSchema.safeParse({ description, photos });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api<IncidentResultRes>(`/rentals/${rentalId}/incident`, {
          method: 'POST',
          body: parsed.data,
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '접수에 실패했어요');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const { insurance, insurer, incident } = result;
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="font-semibold text-amber-800">사고가 접수됐어요</p>
        <p className="mt-1 text-xs text-amber-700">접수번호 {incident.id}</p>

        <div className="mt-3 rounded-lg bg-white p-3 text-sm">
          <p className="font-semibold">
            가입 면책상품 · {insurance.label}
          </p>
          <p className="mt-1 text-gray-600">
            자기부담금{' '}
            <span className="font-semibold text-gray-900">
              {insurance.deductibleKrw === 0 ? '0원 (자기부담 없음)' : `최대 ${krw(insurance.deductibleKrw)}`}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{insurance.description}</p>
        </div>

        <div className="mt-2 rounded-lg bg-white p-3 text-sm">
          <p className="font-semibold">
            {insurer.name} · {insurer.phone}
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-gray-600">
            {insurer.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-amber-300 bg-white py-2 text-sm font-semibold text-amber-700"
      >
        사고 접수
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <label className="block">
        <span className="text-sm font-medium">사고 상황</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="언제·어디서·어떻게 일어났는지 적어 주세요"
          className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <PhotoCapture
        value={photos}
        onChange={setPhotos}
        label="사고 사진 (선택)"
        hint="파손 부위와 주변 상황이 함께 보이면 좋아요"
        disabled={busy}
      />

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? '접수 중...' : '사고 접수하기'}
      </button>
    </div>
  );
}
