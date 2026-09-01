import { API_URL, ApiError, getToken } from './api';

/**
 * 파일 내려받기 (M4-4).
 *
 * `<a href>` 한 줄로 끝내지 못하는 이유는 인증이다: API가 `Authorization` 헤더를 요구하는데
 * 링크 클릭에는 헤더를 실을 수 없다. 그래서 fetch로 받아 Blob으로 만든 뒤 앵커를 눌러 준다.
 * 대신 **쿼리는 화면이 지금 쓰는 것 그대로**라 표에서 본 조건이 파일에 그대로 걸린다.
 *
 * 파일 이름은 서버가 붙인 것을 그대로 쓴다 — 조건(기간·필터·생성일)이 이름에 들어 있어
 * 화면이 다시 만들면 서버가 붙인 규칙과 갈린다.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new ApiError(res.status, '내려받기에 실패했어요');
  }

  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackName;
  saveBlob(blob, name);
}

/**
 * `Content-Disposition`에서 파일 이름 꺼내기.
 * 한글 이름은 `filename*=UTF-8''...`(RFC 5987)에 실려 오고 `filename=`에는 ASCII 대체본만
 * 있으므로 **인코딩된 쪽을 먼저** 본다.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // 깨진 인코딩이면 아래 ASCII 대체본으로 넘어간다
    }
  }
  const plain = /filename="([^"]*)"/i.exec(header);
  return plain ? plain[1] : null;
}

/** Blob을 파일로 저장 — 브라우저에는 "다운로드" API가 없어 앵커를 만들어 누른다 */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 즉시 회수한다 — 안 하면 탭이 살아 있는 동안 Blob이 메모리에 남는다
  URL.revokeObjectURL(url);
}
