import { z } from 'zod';

/**
 * Export 형식 (M4-4) — 목록·리포트 엔드포인트가 공유하는 `?format=` 한 벌.
 *
 * 지정하지 않으면 **기존 JSON 응답 그대로**다. 화면이 쓰는 조회와 내려받기가 같은
 * 엔드포인트·같은 필터를 쓰기 때문에 "표에는 있는데 파일에는 없는 행"이 생기지 않는다.
 */
export const exportFormatSchema = z.enum(['csv', 'json']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const EXPORT_FORMAT_LABEL: Record<ExportFormat, string> = {
  csv: 'CSV',
  json: 'JSON',
};

/** `?format=` — 빈 값은 "지정 안 함"(기존 응답) */
export const exportFormatQuerySchema = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  exportFormatSchema.optional(),
);
