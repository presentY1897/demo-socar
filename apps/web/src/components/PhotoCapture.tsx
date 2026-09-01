'use client';

import { useId, useState } from 'react';
import { PHOTO_MAX_COUNT, toDataUri, type PhotoInput } from '@socar/shared';
import { compressPhotos } from '@/lib/image';

interface Props {
  value: PhotoInput[];
  onChange: (photos: PhotoInput[]) => void;
  /** 체크인/아웃·사고 접수가 공유하는 공통 첨부 위젯 — 라벨만 접수 성격에 맞게 바꾼다 */
  label?: string;
  hint?: string;
  max?: number;
  disabled?: boolean;
}

/**
 * 촬영 → 압축 → 미리보기 공통 위젯.
 *
 * 파일은 선택 즉시 압축해서 상위에 `{mime, data}` 형태로 넘긴다 —
 * 제출 시점에 한꺼번에 압축하면 버튼을 누른 뒤 수 초간 멈춘 것처럼 보인다.
 */
export function PhotoCapture({
  value,
  onChange,
  label = '사진 촬영',
  hint,
  max = PHOTO_MAX_COUNT,
  disabled = false,
}: Props) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // 같은 파일을 다시 고를 수 있게 비운다 (input[type=file]은 값이 같으면 change가 안 난다)
    event.target.value = '';
    if (files.length === 0) return;

    setError(null);
    if (value.length + files.length > max) {
      setError(`사진은 최대 ${max}장까지 첨부할 수 있어요`);
      return;
    }

    setBusy(true);
    try {
      onChange([...value, ...(await compressPhotos(files))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  const full = value.length >= max;

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-xs text-gray-400" data-testid="photo-count">
          {value.length}/{max}
        </span>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        {value.map((photo, i) => (
          <div key={`${i}-${photo.data.slice(0, 16)}`} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI라 next/image 최적화 대상이 아니다 */}
            <img
              src={toDataUri(photo)}
              alt={`첨부 사진 ${i + 1}`}
              className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
            />
            <button
              type="button"
              aria-label={`첨부 사진 ${i + 1} 삭제`}
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-gray-800 text-xs leading-5 text-white"
            >
              ×
            </button>
          </div>
        ))}

        {!full && (
          <label
            htmlFor={inputId}
            className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400 ${
              disabled || busy ? 'opacity-40' : ''
            }`}
          >
            <span className="text-lg leading-none">📷</span>
            {busy ? '처리 중' : '추가'}
          </label>
        )}
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={disabled || busy}
        onChange={handleFiles}
        className="sr-only"
      />

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
