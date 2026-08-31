import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { TravelModule } from './travel/travel.module';

@Module({
  imports: [ReservationsModule, TravelModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
