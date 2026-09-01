import { RESERVATION_STATUS_LABEL, type ReservationStatusValue } from '@socar/shared';
import type { ExportSpec } from '../common/export/export';

/**
 * 내 예약 목록 CSV의 열 (M4-4).
 *
 * `GET /reservations/mine`은 Prisma 행을 그대로 내보내는 유일한 Export 대상이라(운영 목록은
 * 전부 응답 스키마를 거친다) 여기서 필요한 필드만 골라 편다. 수령 방식은 세 갈래인데
 * 화면과 같은 말로 옮긴다: 편도(반납 존이 다름) · 부름(수령지 좌표) · 왕복.
 *
 * **자기 예약만** 나간다 — 목록 조회 자체가 로그인 사용자로 좁혀져 있어 Export도 같은 범위다.
 */
export interface MyReservationRow {
  id: string;
  startAt: Date;
  endAt: Date;
  status: ReservationStatusValue;
  totalUpfrontKrw: number;
  rentalFeeKrw: number;
  insuranceFeeKrw: number;
  onewayFeeKrw: number;
  deliveryFeeKrw: number;
  discountKrw: number;
  creditUsedKrw: number;
  deliveryLabel: string | null;
  vehicle: { modelName: string; plateNo: string; zone: { name: string } };
  returnZone: { name: string } | null;
  rental: { returnedAt: Date | null; distanceKm: number | null; lateMinutes: number } | null;
}

export const MY_RESERVATIONS_EXPORT: ExportSpec<MyReservationRow> = {
  name: '내예약',
  columns: [
    { header: '예약 시작', value: (r) => iso(r.startAt) },
    { header: '예약 종료', value: (r) => iso(r.endAt) },
    { header: '상태', value: (r) => RESERVATION_STATUS_LABEL[r.status] },
    { header: '차종', value: (r) => r.vehicle.modelName },
    { header: '차량 번호', value: (r) => r.vehicle.plateNo },
    { header: '대여 존', value: (r) => r.vehicle.zone.name },
    { header: '수령 방식', value: (r) => pickupLabel(r) },
    { header: '반납 존', value: (r) => r.returnZone?.name ?? r.vehicle.zone.name },
    { header: '선결제 합계(원)', value: (r) => r.totalUpfrontKrw },
    { header: '대여요금(원)', value: (r) => r.rentalFeeKrw },
    { header: '보험료(원)', value: (r) => r.insuranceFeeKrw },
    { header: '편도 수수료(원)', value: (r) => r.onewayFeeKrw },
    { header: '부름 수수료(원)', value: (r) => r.deliveryFeeKrw },
    { header: '할인(원)', value: (r) => r.discountKrw },
    { header: '크레딧 사용(원)', value: (r) => r.creditUsedKrw },
    { header: '실제 반납', value: (r) => iso(r.rental?.returnedAt ?? null) },
    { header: '주행거리(km)', value: (r) => r.rental?.distanceKm },
    { header: '지연(분)', value: (r) => r.rental?.lateMinutes },
  ],
};

const iso = (at: Date | null) => at?.toISOString() ?? '';

/** 편도와 부름은 배타다 (ADR-006) — 둘 다 아니면 왕복 */
function pickupLabel(r: MyReservationRow): string {
  if (r.deliveryLabel) return `부름 (${r.deliveryLabel})`;
  if (r.returnZone) return '편도';
  return '왕복';
}
