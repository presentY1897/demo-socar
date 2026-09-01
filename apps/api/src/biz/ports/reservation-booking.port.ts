import type { CorpGrade, UserRole } from '@socar/shared';

/**
 * biz(MOCAR 비즈니스) → 소비자 도메인으로 나가는 유일한 서비스 호출 창구.
 *
 * biz 컨텍스트는 `ReservationsService`를 직접 import 하지 않고 이 포트만 본다.
 * "별도 서비스로 추출한다면 여기서 자른다" — 추출 시 어댑터(adapters/)만
 * HTTP 클라이언트 구현으로 갈아끼우면 biz 코드는 그대로 돌아간다.
 */

/** 예약 주체 — 배차 승인은 요청자(임직원) 명의로 예약을 만든다 */
export interface BookingActor {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  corporationId: string | null;
  corpGrade: CorpGrade | null;
}

export interface BookingRequest {
  vehicleId: string;
  /** ISO8601 (offset 포함) */
  startAt: string;
  endAt: string;
  /** 중복 승인 방지 — 같은 키로는 예약이 1건만 만들어진다 */
  idempotencyKey: string;
  /** 법인 전용(리스) 차량이면 과금 없이 예약 */
  corporateDedicated: boolean;
}

export interface BookingResult {
  id: string;
}

export interface ReservationBookingPort {
  /**
   * 예약 생성. 동시성 충돌은 Nest `ConflictException`으로 올라온다 —
   * 추출 시에는 어댑터가 원격 409를 같은 예외로 번역해야 한다.
   */
  book(actor: BookingActor, request: BookingRequest): Promise<BookingResult>;
}

export const RESERVATION_BOOKING = Symbol('RESERVATION_BOOKING');
