import { vi } from 'vitest';

/**
 * 사진 압축 대역 — jsdom에는 캔버스 인코더도 `createImageBitmap`도 없다.
 *
 * `ZoneMap`을 대역으로 세우는 것과 같은 이유로(README 참고) 브라우저 전용 부분만 바꾸고,
 * 축소 크기 계산·품질 하향 루프 같은 우리 로직은 실제 코드를 그대로 태운다.
 */

/** 정확히 `bytes` 바이트로 디코드되는 base64 */
export const base64OfBytes = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64');

/** 카메라로 찍은 원본을 대신하는 더미 파일 */
export const jpegFile = (name = 'photo.jpg') =>
  new File([new Uint8Array(64)], name, { type: 'image/jpeg' });

interface StubOptions {
  /** 원본 크기 (리사이즈 계산 입력) */
  width?: number;
  height?: number;
  /** 품질 단계별 인코딩 결과 바이트 — 마지막 값이 이후 단계에 계속 쓰인다 */
  bytesPerStep?: number[];
}

/**
 * `createImageBitmap` + 캔버스 인코딩을 대역으로 세운다.
 * 반환된 `toDataURL` 목으로 "어떤 품질까지 내려갔는지"를 검증할 수 있다.
 */
export function stubImagePipeline({
  width = 4000,
  height = 3000,
  bytesPerStep = [180 * 1024],
}: StubOptions = {}) {
  let step = 0;
  // 품질 인자를 받아 두면 테스트가 "몇 단계까지 내려갔는지"를 그대로 검증할 수 있다
  const toDataURL = vi.fn((mime?: string, quality?: number) => {
    const bytes = bytesPerStep[Math.min(step, bytesPerStep.length - 1)];
    step += 1;
    void quality;
    return `data:${mime ?? 'image/png'};base64,${base64OfBytes(bytes)}`;
  });
  const drawImage = vi.fn();

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    toDataURL as unknown as HTMLCanvasElement['toDataURL'],
  );

  return { toDataURL, drawImage };
}
