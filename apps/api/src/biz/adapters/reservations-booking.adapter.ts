import { Injectable } from '@nestjs/common';
import { ReservationsService } from '../../reservations/reservations.service';
import type {
  BookingActor,
  BookingRequest,
  BookingResult,
  ReservationBookingPort,
} from '../ports/reservation-booking.port';

/**
 * 추출 경계 — biz 컨텍스트 안에서 소비자 도메인(reservations)을 직접 아는 **유일한** 파일.
 *
 * 지금은 같은 프로세스라 서비스를 그대로 호출한다. biz를 별도 앱/배포로 떼면
 * 이 클래스만 `POST /reservations` HTTP 클라이언트로 바꾸면 되고,
 * `dispatch.service.ts`를 비롯한 biz 코드는 손대지 않는다.
 */
@Injectable()
export class ReservationsBookingAdapter implements ReservationBookingPort {
  constructor(private readonly reservations: ReservationsService) {}

  async book(actor: BookingActor, request: BookingRequest): Promise<BookingResult> {
    return this.reservations.create(
      actor,
      {
        vehicleId: request.vehicleId,
        startAt: request.startAt,
        endAt: request.endAt,
        insurance: 'STANDARD',
        useCredit: false,
        cardLast4: '9999', // 법인카드 (모의)
        idempotencyKey: request.idempotencyKey,
      },
      { corporateDedicated: request.corporateDedicated },
    );
  }
}
