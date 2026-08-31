import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { RentalsController } from './rentals.controller';
import { RentalsService } from './rentals.service';

@Module({
  imports: [PaymentsModule],
  controllers: [RentalsController],
  providers: [RentalsService],
})
export class RentalsModule {}
