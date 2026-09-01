import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_BYTES, PHOTO_QUALITY_STEPS, base64Bytes, photoSchema } from '@socar/shared';
import { PhotoTooLargeError, compressPhoto, compressPhotos } from '@/lib/image';
import { jpegFile, stubImagePipeline } from '@/test/image';

describe('사진 압축', () => {
  it('최대 변 1280px로 축소한 캔버스에 그린다', async () => {
    const { drawImage } = stubImagePipeline({ width: 4000, height: 3000 });

    await compressPhoto(jpegFile());

    // 4000×3000 → 1280×960
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 960);
  });

  it('첫 품질에서 200KB 이하면 더 낮추지 않는다', async () => {
    const { toDataURL } = stubImagePipeline({ bytesPerStep: [180 * 1024] });

    const photo = await compressPhoto(jpegFile());

    expect(toDataURL).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', PHOTO_QUALITY_STEPS[0]);
    expect(base64Bytes(photo.data)).toBe(180 * 1024);
    expect(photoSchema.safeParse(photo).success).toBe(true);
  });

  it('3MB급 원본은 상한 이하가 될 때까지 품질을 단계적으로 낮춘다', async () => {
    const { toDataURL } = stubImagePipeline({ bytesPerStep: [3_000_000, 420 * 1024, 150 * 1024] });

    const photo = await compressPhoto(jpegFile());

    expect(toDataURL.mock.calls.map((c) => c[1])).toEqual([
      PHOTO_QUALITY_STEPS[0],
      PHOTO_QUALITY_STEPS[1],
      PHOTO_QUALITY_STEPS[2],
    ]);
    expect(base64Bytes(photo.data)).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
    expect(photoSchema.safeParse(photo).success).toBe(true);
  });

  it('가장 낮은 품질로도 상한을 못 맞추면 에러를 던진다', async () => {
    stubImagePipeline({ bytesPerStep: [5_000_000] });

    await expect(compressPhoto(jpegFile())).rejects.toBeInstanceOf(PhotoTooLargeError);
  });

  it('여러 장을 순서대로 압축한다', async () => {
    stubImagePipeline({ bytesPerStep: [100 * 1024] });

    const photos = await compressPhotos([jpegFile('a.jpg'), jpegFile('b.jpg')]);

    expect(photos).toHaveLength(2);
    expect(photos.every((p) => p.mime === 'image/jpeg')).toBe(true);
  });
});
