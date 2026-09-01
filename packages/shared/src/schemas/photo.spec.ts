import { describe, expect, it } from 'vitest';
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_COUNT,
  base64Bytes,
  fitWithin,
  isBase64,
  photoSchema,
  photosSchema,
  requiredPhotosSchema,
  toDataUri,
} from './photo';

/** 정확히 `bytes` 바이트로 디코드되는 base64 (패딩 포함) */
const b64 = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64');
const photo = (bytes: number) => ({ mime: 'image/jpeg', data: b64(bytes) });

describe('base64Bytes — 디코드 없이 바이트 수 계산', () => {
  it.each([0, 1, 2, 3, 100, 199_999, PHOTO_MAX_BYTES])('%i바이트를 그대로 되돌린다', (bytes) => {
    const data = b64(bytes);
    if (bytes === 0) return expect(isBase64(data)).toBe(false);
    expect(base64Bytes(data)).toBe(bytes);
  });

  it('base64가 아닌 문자열은 isBase64에서 걸러진다', () => {
    expect(isBase64('data:image/jpeg;base64,AAAA')).toBe(false); // data: URI 접두사는 받지 않는다
    expect(isBase64('AAA')).toBe(false); // 4의 배수가 아님
    expect(isBase64('AA A=')).toBe(false);
  });
});

describe('fitWithin — 최대 변 1280px 축소', () => {
  it('가로가 긴 사진은 가로를 1280으로 맞추고 비율을 유지한다', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
  });

  it('세로가 긴 사진은 세로를 1280으로 맞춘다', () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
  });

  it('이미 작은 사진은 확대하지 않는다', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('photoSchema — 장당 검증', () => {
  it('200KB 이하 JPEG는 통과한다', () => {
    expect(photoSchema.safeParse(photo(PHOTO_MAX_BYTES)).success).toBe(true);
  });

  it('200KB를 넘으면 거부한다', () => {
    const result = photoSchema.safeParse(photo(PHOTO_MAX_BYTES + 3));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('200KB');
  });

  it('jpeg 외 mime은 거부한다', () => {
    const result = photoSchema.safeParse({ mime: 'image/png', data: b64(1000) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('JPEG');
  });

  it('base64가 아닌 데이터는 거부한다', () => {
    expect(photoSchema.safeParse({ mime: 'image/jpeg', data: '!!not-base64!!' }).success).toBe(false);
  });
});

describe('photosSchema — 건당 장수 제한', () => {
  it(`${PHOTO_MAX_COUNT}장까지 통과한다`, () => {
    expect(photosSchema.safeParse(Array.from({ length: PHOTO_MAX_COUNT }, () => photo(1000))).success).toBe(true);
  });

  it(`${PHOTO_MAX_COUNT + 1}장은 거부한다`, () => {
    const result = photosSchema.safeParse(Array.from({ length: PHOTO_MAX_COUNT + 1 }, () => photo(1000)));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('최대 5장');
  });

  it('빈 배열은 photosSchema에선 통과하고 requiredPhotosSchema에선 거부된다', () => {
    expect(photosSchema.safeParse([]).success).toBe(true);
    expect(requiredPhotosSchema.safeParse([]).success).toBe(false);
  });
});

describe('toDataUri', () => {
  it('mime + base64를 화면이 바로 쓰는 data: URI로 만든다', () => {
    expect(toDataUri({ mime: 'image/jpeg', data: 'AAAA' })).toBe('data:image/jpeg;base64,AAAA');
  });
});
