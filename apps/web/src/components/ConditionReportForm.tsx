'use client';

import { useState } from 'react';
import {
  checkInSchema,
  checkOutSchema,
  type CheckInDto,
  type CheckOutDto,
  type ConditionReportRes,
  type PhotoInput,
} from '@socar/shared';
import { fmtDateTime } from '@/lib/format';
import { PhotoCapture } from './PhotoCapture';

type Phase = 'CHECK_IN' | 'CHECK_OUT';

const COPY = {
  CHECK_IN: {
    photoLabel: '차량 상태 촬영',
    photoHint: '외관 흠집·실내 상태를 남겨 두면 반납 후 책임 다툼을 피할 수 있어요',
    notesLabel: '차량 상태 메모 (선택)',
    notesPlaceholder: '예: 앞범퍼 우측 하단에 기존 흠집',
    submit: '체크인 완료',
  },
  CHECK_OUT: {
    photoLabel: '주차 위치 촬영',
    photoHint: '주차한 자리와 주변 표지가 보이게 찍어 주세요',
    notesLabel: '반납 메모 (선택)',
    notesPlaceholder: '예: 연료 70%, 실내 정리 완료',
    submit: '체크아웃 완료',
  },
} as const;

interface Props {
  phase: Phase;
  onSubmit: (dto: CheckInDto | CheckOutDto) => Promise<unknown>;
}

/**
 * 체크인/체크아웃 공용 제출 폼.
 *
 * 제출 전에 서버와 같은 shared 스키마로 먼저 검증한다 — 사진을 다 찍고 나서
 * 400을 받는 것보다, 버튼을 누른 자리에서 부족한 항목을 알려주는 편이 낫다.
 */
export function ConditionReportForm({ phase, onSubmit }: Props) {
  const copy = COPY[phase];
  const [photos, setPhotos] = useState<PhotoInput[]>([]);
  const [notes, setNotes] = useState('');
  const [parkingNote, setParkingNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const candidate =
      phase === 'CHECK_IN'
        ? { notes: notes.trim() || undefined, photos }
        : { notes: notes.trim() || undefined, parkingNote: parkingNote.trim(), photos };
    const parsed = (phase === 'CHECK_IN' ? checkInSchema : checkOutSchema).safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <PhotoCapture
        value={photos}
        onChange={setPhotos}
        label={copy.photoLabel}
        hint={copy.photoHint}
        disabled={busy}
      />

      {phase === 'CHECK_OUT' && (
        <label className="block">
          <span className="text-sm font-medium">주차 위치 (층·구역)</span>
          <input
            value={parkingNote}
            onChange={(e) => setParkingNote(e.target.value)}
            placeholder="예: 지하 2층 B-14"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium">{copy.notesLabel}</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={copy.notesPlaceholder}
          rows={2}
          className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="w-full rounded-lg bg-sky-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? '제출 중...' : copy.submit}
      </button>
    </div>
  );
}

/** 제출된 보고 다시 보기 — 완료된 단계를 펼쳤을 때 그대로 확인할 수 있게 */
export function ConditionReportSummary({ report }: { report: ConditionReportRes }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-gray-400">{fmtDateTime(report.createdAt)} 제출</p>
      {report.parkingNote && (
        <p>
          <span className="text-gray-500">주차 위치</span> · {report.parkingNote}
        </p>
      )}
      {report.notes && <p className="whitespace-pre-wrap text-gray-600">{report.notes}</p>}
      <div className="flex flex-wrap gap-2">
        {report.photos.map((photo, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- data: URI라 next/image 최적화 대상이 아니다
          <img
            key={photo.id}
            src={photo.dataUri}
            alt={`${report.phase === 'CHECK_IN' ? '체크인' : '체크아웃'} 사진 ${i + 1}`}
            className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
          />
        ))}
      </div>
    </div>
  );
}
