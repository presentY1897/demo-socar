'use client';

import { useState } from 'react';
import { EXPORT_FORMAT_LABEL, exportFormatSchema, type ExportFormat } from '@socar/shared';
import { downloadFile } from '@/lib/download';

/**
 * 내보내기 버튼 (M4-4) — 지금 화면에 걸린 필터를 그대로 실어 파일로 내려받는다.
 *
 * 운영 센터 탭뿐 아니라 소비자 화면(내 예약)도 쓰기 때문에 `components/ops`가 아니라
 * 공용 자리에 둔다. 목록마다 버튼을 따로 만들지 않는 이유는 "화면이 보는 쿼리 = 파일이 받는 쿼리"라는 약속을
 * 한 곳에서 지키기 위해서다. `query`는 그 화면이 조회에 쓰는 쿼리스트링 그대로를 받는다 —
 * 여기서 다시 조립하면 표에는 있는데 파일에는 없는 행이 생긴다.
 */
export function ExportButtons({
  path,
  query,
  label,
}: {
  /** API 경로 (예: `/ops/fleet`) */
  path: string;
  /** 화면이 지금 조회에 쓰는 쿼리스트링 (`state=IDLE&sort=plateNo`) */
  query?: string;
  /** 무엇을 내려받는지 — 스크린리더와 실패 문구가 쓴다 */
  label: string;
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (format: ExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      const search = [query, `format=${format}`].filter(Boolean).join('&');
      await downloadFile(`${path}?${search}`, `${label}.${format}`);
    } catch {
      setError('내려받지 못했어요. 잠시 후 다시 시도해 주세요');
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="flex items-center gap-1">
      {error && (
        <span role="alert" className="text-[11px] text-red-500">
          {error}
        </span>
      )}
      <span className="flex gap-1" role="group" aria-label={`${label} 내보내기`}>
        {exportFormatSchema.options.map((format) => (
          <button
            key={format}
            onClick={() => run(format)}
            disabled={busy !== null}
            className="rounded-lg border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-500 disabled:opacity-50"
          >
            {busy === format ? '받는 중...' : EXPORT_FORMAT_LABEL[format]}
          </button>
        ))}
      </span>
    </span>
  );
}
