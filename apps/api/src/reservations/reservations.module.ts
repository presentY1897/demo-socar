import { Module } from '@nestjs/common';
import { HandlerTasksModule } from '../handler/handler-tasks.module';
import { PaymentsModule } from '../payments/payments.module';
import { TravelModule } from '../common/travel/travel.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [PaymentsModule, HandlerTasksModule, TravelModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
