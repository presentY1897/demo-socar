import { z } from 'zod';

/**
 * 사진 업로드 계약 — 웹의 압축 결과와 API 검증이 같은 스키마를 본다.
 *
 * 외부 스토리지 없이 base64로 DB에 넣기 때문에(무료 티어 유지 — project-review §6-Q2)
 * 용량 상한이 곧 저장소 예산이다: 장당 200KB × 건당 5장 = 접수 1건당 최대 1MB.
 */

export const PHOTO_MIME = 'image/jpeg';
/** 장당 최대 바이트 (디코드 기준) */
export const PHOTO_MAX_BYTES = 200 * 1024;
/** 건당 최대 장수 */
export const PHOTO_MAX_COUNT = 5;
/** 리사이즈 후 최대 변 길이(px) */
export const PHOTO_MAX_EDGE = 1280;
/** JPEG 품질 하향 단계 — 앞에서부터 시도해 200KB 이하가 되는 첫 품질을 쓴다 */
export const PHOTO_QUALITY_STEPS = [0.7, 0.55, 0.4, 0.3] as const;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** data: URI 접두사 없이 base64 본문만 받는다 (전송량을 줄이고 mime을 필드로 명시) */
export function isBase64(data: string): boolean {
  return data.length > 0 && data.length % 4 === 0 && BASE64_RE.test(data);
}

/**
 * base64 문자열의 디코드 후 바이트 수.
 * 실제 디코드 없이 길이로 계산한다 — 검증 때마다 수백 KB를 복사하지 않기 위해서.
 * 유효한 base64(`isBase64`)에만 의미가 있다.
 */
export function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

/** 최대 변 길이에 맞춘 축소 크기 — 원본이 더 작으면 그대로 둔다(확대는 하지 않는다) */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** 저장된 사진을 `<img src>`에 바로 물릴 수 있는 형태로 만든다 (정적 서빙 경로 불필요) */
export const toDataUri = (photo: { mime: string; data: string }): string =>
  `data:${photo.mime};base64,${photo.data}`;

export const photoSchema = z
  .object({
    mime: z.literal(PHOTO_MIME, {
      errorMap: () => ({ message: 'JPEG(image/jpeg) 사진만 올릴 수 있어요' }),
    }),
    data: z.string().refine(isBase64, 'base64 이미지 데이터가 아닙니다'),
  })
  .refine((p) => base64Bytes(p.data) <= PHOTO_MAX_BYTES, {
    message: `사진 1장은 ${PHOTO_MAX_BYTES / 1024}KB를 넘을 수 없어요`,
    path: ['data'],
  });
export type PhotoInput = z.infer<typeof photoSchema>;

export const photosSchema = z
  .array(photoSchema)
  .max(PHOTO_MAX_COUNT, `사진은 최대 ${PHOTO_MAX_COUNT}장까지 첨부할 수 있어요`);

/** 사진이 증빙 자체인 접수(체크인/체크아웃)는 최소 1장을 강제한다 */
export const requiredPhotosSchema = photosSchema.min(1, '사진을 최소 1장 첨부해 주세요');

/** 저장된 사진의 응답 형태 */
export const storedPhotoSchema = z.object({
  id: z.string(),
  mime: z.string(),
  bytes: z.number().int(),
  dataUri: z.string(),
});
export type StoredPhotoRes = z.infer<typeof storedPhotoSchema>;
