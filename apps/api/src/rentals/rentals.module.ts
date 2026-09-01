import { Module } from '@nestjs/common';
import { HandlerTasksModule } from '../handler/handler-tasks.module';
import { PaymentsModule } from '../payments/payments.module';
import { RentalsController } from './rentals.controller';
import { RentalsService } from './rentals.service';

@Module({
  imports: [PaymentsModule, HandlerTasksModule],
  controllers: [RentalsController],
  providers: [RentalsService],
})
export class RentalsModule {}
