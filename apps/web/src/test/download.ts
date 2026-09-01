import { vi } from 'vitest';

/**
 * 파일 저장 대역 (M4-4) — jsdom에는 `URL.createObjectURL`도, 진짜 다운로드도 없다.
 *
 * `sse.ts`·`chart.ts`와 같은 방식이다: 브라우저만 할 수 있는 마지막 한 걸음(Blob URL 발급과
 * 앵커 클릭)만 대역으로 세우고, **어떤 URL로 무엇을 받아 어떤 이름으로 저장하는지**는
 * 실제 코드(`lib/download.ts`)가 그대로 돈다.
 */

export interface SavedFile {
  /** `<a download>`에 실린 이름 — 서버가 준 Content-Disposition에서 왔는지 여기서 본다 */
  filename: string;
  blob: Blob;
  text: () => Promise<string>;
  /** 저장 후 Blob URL을 회수했는가 (안 하면 탭이 사는 동안 메모리에 남는다) */
  revoked: boolean;
  /** 발급된 Blob URL — revoke 추적용 */
  url: string;
}

export function stubDownloads(): SavedFile[] {
  const saved: SavedFile[] = [];
  const blobs = new Map<string, Blob>();
  let seq = 0;

  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:mock/${++seq}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    const file = saved.find((f) => f.url === url);
    if (file) file.revoked = true;
  }) as typeof URL.revokeObjectURL;

  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const url = this.getAttribute('href') ?? '';
    const blob = blobs.get(url) ?? new Blob();
    saved.push({ url, filename: this.download, blob, text: () => readBlob(blob), revoked: false });
  };

  return saved;
}

/** jsdom의 Blob에는 `text()`가 없다 — FileReader로 읽는다 */
const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
