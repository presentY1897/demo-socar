import {
  PHOTO_MAX_BYTES,
  PHOTO_MIME,
  PHOTO_QUALITY_STEPS,
  base64Bytes,
  fitWithin,
  type PhotoInput,
} from '@socar/shared';

/**
 * 촬영한 사진을 서버 계약(장당 200KB 이하 JPEG)에 맞게 브라우저에서 압축한다.
 *
 * 원본을 그대로 올리면 3~5MB짜리가 DB에 그대로 쌓인다 — 무료 티어(0.5GB)에서는
 * 업로드 전에 줄이는 쪽이 유일하게 지속 가능한 선택이다(project-review §6-Q2).
 * 최대 변 1280px로 리사이즈한 뒤 품질을 단계적으로 낮춰 상한 이하가 되는 첫 결과를 쓴다.
 */

/** 품질을 가장 낮은 단계까지 내려도 상한을 못 맞춘 경우 */
export class PhotoTooLargeError extends Error {
  constructor() {
    super('사진 용량을 줄이지 못했어요. 다른 사진으로 시도해 주세요');
    this.name = 'PhotoTooLargeError';
  }
}

export async function compressPhoto(file: File): Promise<PhotoInput> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('이 브라우저에서는 사진 첨부를 지원하지 않아요');
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('사진을 처리하지 못했어요');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of PHOTO_QUALITY_STEPS) {
    const data = canvas.toDataURL(PHOTO_MIME, quality).split(',')[1] ?? '';
    if (data && base64Bytes(data) <= PHOTO_MAX_BYTES) return { mime: PHOTO_MIME, data };
  }
  throw new PhotoTooLargeError();
}

/** 여러 장을 순차 압축한다 — 동시 처리하면 모바일에서 캔버스 메모리가 터진다 */
export async function compressPhotos(files: File[]): Promise<PhotoInput[]> {
  const out: PhotoInput[] = [];
  for (const file of files) out.push(await compressPhoto(file));
  return out;
}
