import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { exportFormatQuerySchema, type ExportFormat } from '@socar/shared';
import { csvFile } from './csv';

/**
 * Export 공통 경로 (M4-4) — `?format=csv|json`이면 파일로, 없으면 **기존 응답 그대로**.
 *
 * 목록마다 따로 만들지 않는 이유는 형식이 아니라 약속이 하나여야 하기 때문이다:
 * BOM·헤더 라벨·파일명 규칙·`Content-Disposition`이 엔드포인트마다 다르면 내려받은 파일이
 * 어디서 왔느냐에 따라 엑셀에서 다르게 열린다.
 */

/**
 * CSV 한 열. **평탄화는 여기서 손으로 한다** — 중첩 객체(`telemetry`·`insurance`·`vehicle`)를
 * 자동으로 펴면 `telemetry.fuelPct` 같은 헤더가 나오는데, 그건 사람이 읽는 표가 아니다.
 * 열 정의가 "무엇을 어떤 이름으로 낼지"의 단일 소스다.
 */
export interface ExportColumn<T> {
  /** CSV 헤더 (한국어 라벨 — 화면의 열 이름과 같은 말) */
  header: string;
  value: (row: T) => unknown;
}

export interface ExportSpec<T> {
  /** 파일 이름 앞부분 (한국어) */
  name: string;
  columns: ExportColumn<T>[];
}

export interface ExportFile {
  body: string;
  contentType: string;
  filename: string;
}

/** `?format=` 파싱 — 알 수 없는 값은 조용히 무시하지 않고 400 */
export function parseExportFormat(raw: unknown): ExportFormat | undefined {
  const parsed = exportFormatQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException('format은 csv 또는 json이어야 합니다');
  }
  return parsed.data as ExportFormat | undefined;
}

export function buildExportFile<T>(opts: {
  format: ExportFormat;
  spec: ExportSpec<T>;
  rows: T[];
  /** JSON 본문 (기본: rows 그대로). 리포트처럼 meta가 함께 나가는 응답용 */
  json?: unknown;
  /** 파일명에 덧붙일 조각 — 무슨 조건으로 뽑았는지가 파일명에 남는다 */
  parts?: (string | null | undefined)[];
}): ExportFile {
  const { format, spec, rows, json, parts } = opts;
  const filename = exportFilename(spec.name, parts ?? [], format);

  if (format === 'json') {
    return {
      body: JSON.stringify(json ?? rows, null, 2),
      contentType: 'application/json; charset=utf-8',
      filename,
    };
  }
  return {
    body: csvFile(
      spec.columns.map((c) => c.header),
      rows.map((row) => spec.columns.map((c) => c.value(row))),
    ),
    contentType: 'text/csv; charset=utf-8',
    filename,
  };
}

/** 헤더를 세우고 본문을 돌려준다 (컨트롤러가 `@Res({ passthrough: true })`로 받은 res에) */
export function respondExport(res: Response, file: ExportFile): string {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', contentDisposition(file.filename));
  return file.body;
}

/**
 * 한글 파일명은 `filename=`만으로는 브라우저가 깨뜨린다.
 * RFC 5987 `filename*`을 함께 실어 주고, 못 읽는 클라이언트를 위해 ASCII 대체본을 남긴다.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** 파일명에 붙는 생성일 (KST 달력) — 언제 뽑은 파일인지가 이름에 남는다 */
export const exportDateStamp = (now = new Date()): string =>
  new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** `차량목록_대기_2026-09-01.csv` — 조건이 파일명에 남아야 파일만 보고도 무엇인지 안다 */
export function exportFilename(
  name: string,
  parts: (string | null | undefined)[],
  format: ExportFormat,
): string {
  const safe = [name, ...parts]
    .filter((p): p is string => Boolean(p))
    // 파일명에 쓸 수 없는 문자만 걷어낸다 (한글·공백은 그대로 둔다)
    .map((p) => p.replace(/[\\/:*?"<>|]/g, '-').trim())
    .filter(Boolean);
  return `${safe.join('_')}.${format}`;
}
