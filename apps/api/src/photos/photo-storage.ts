import { base64Bytes, toDataUri, type PhotoInput, type StoredPhotoRes } from '@socar/shared';

/**
 * 사진 저장/조회 공통 경로 — 체크인/아웃(M1-3) · 사고 접수(M1-7) · 핸들러 완료 인증(M2-3)이 공유한다.
 *
 * 사진은 외부 스토리지 없이 base64 텍스트로 DB에 넣는다(무료 티어 유지).
 * `ConditionPhoto`/`IncidentPhoto`는 같은 컬럼 규격이라 두 테이블 모두 이 함수를 쓴다.
 */

/** DB에 들어가는 행의 공통 컬럼 — 두 사진 테이블이 공유하는 모양 */
export interface PhotoRow {
  mime: string;
  data: string;
  bytes: number;
}

/**
 * shared 스키마를 통과한 업로드 입력을 Prisma nested create 행으로 바꾼다.
 * `bytes`는 클라이언트가 보낸 값을 믿지 않고 여기서 다시 계산한다 — 통계·용량 관리의 기준값이라서.
 */
export function toPhotoRows(photos: PhotoInput[]): PhotoRow[] {
  return photos.map((p) => ({ mime: p.mime, data: p.data, bytes: base64Bytes(p.data) }));
}

/**
 * 저장된 사진을 응답 형태로 바꾼다.
 * base64를 그대로 내려주는 대신 `data:` URI로 조립해서, 화면이 `<img src>`에 바로 물릴 수 있게 한다
 * (사진 전용 정적 서빙 엔드포인트가 필요 없다).
 */
export function toStoredPhotos(rows: ({ id: string } & PhotoRow)[]): StoredPhotoRes[] {
  return rows.map((r) => ({
    id: r.id,
    mime: r.mime,
    bytes: r.bytes,
    dataUri: toDataUri(r),
  }));
}

/** 접수 1건이 차지하는 저장 용량 — 운영 지표(M3)에서 재사용 */
export const totalPhotoBytes = (rows: PhotoRow[]): number =>
  rows.reduce((sum, r) => sum + r.bytes, 0);
