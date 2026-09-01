import { Module } from '@nestjs/common';
import { ReservationsModule } from '../../reservations/reservations.module';
import { TravelModule } from '../../dispatch/travel/travel.module';
import { ReservationsBookingAdapter } from '../adapters/reservations-booking.adapter';
import { RESERVATION_BOOKING } from '../ports/reservation-booking.port';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

/**
 * 법인 배차 (biz 컨텍스트). URL은 `/biz/dispatch/*`.
 *
 * 소비자 도메인 의존은 여기서만 보인다 — `ReservationsModule`을 import 하는 이유는
 * 어댑터 1개(ReservationsBookingAdapter)를 조립하기 위해서고, 서비스 코드는
 * `RESERVATION_BOOKING` 포트만 안다. 추출 시 이 두 줄이 잘라내는 지점이다.
 */
@Module({
  imports: [ReservationsModule, TravelModule],
  controllers: [DispatchController],
  providers: [
    DispatchService,
    { provide: RESERVATION_BOOKING, useClass: ReservationsBookingAdapter },
  ],
})
export class DispatchModule {}
