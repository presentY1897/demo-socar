/**
 * CSV 직렬화 (M4-4) — 순수 함수. 엑셀에서 바로 열리는 것이 목표다.
 *
 * 두 가지가 이 파일의 이유다:
 * 1. **UTF-8 BOM** — 없으면 엑셀이 한글을 깨뜨린다(cp949로 읽는다). 표준이 아니라 관습이지만
 *    "내려받은 파일이 깨져 보인다"는 사용자에게는 인코딩 논쟁보다 중요한 사실이다.
 * 2. **이스케이프** — 쉼표·따옴표·개행이 든 값(존 주소, 정비 메모, 취소 사유)은 그대로 쓰면
 *    열이 밀리거나 행이 갈라진다. RFC 4180대로 감싸고 따옴표는 두 번 적는다.
 */

/** 엑셀이 UTF-8로 읽게 하는 표식 */
export const UTF8_BOM = '﻿';

/** 엑셀·윈도우 호환 줄바꿈 */
const CRLF = '\r\n';

const NEEDS_QUOTE = /[",\r\n]/;

/** 값 하나를 CSV 칸으로 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Date는 파일에서 사람이 읽는 값이라 ISO로 (열별 포맷은 열 정의가 정한다)
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!NEEDS_QUOTE.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** 헤더 + 행 → CSV 본문 (BOM 없음) */
export function csvBody(headers: readonly string[], rows: readonly unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join(CRLF) + CRLF;
}

/** 엑셀에서 바로 여는 CSV 파일 내용 (BOM 포함) */
export const csvFile = (headers: readonly string[], rows: readonly unknown[][]): string =>
  UTF8_BOM + csvBody(headers, rows);
