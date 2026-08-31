import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { TravelModule } from '../dispatch/travel/travel.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [PaymentsModule, TravelModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
