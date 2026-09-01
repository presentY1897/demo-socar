import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BizModule } from './biz/biz.module';
import { HealthController } from './health.controller';
import { InquiriesModule } from './inquiries/inquiries.module';
import { MetricsModule } from './metrics/metrics.module';
import { OpsModule } from './ops/ops.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RentalsModule } from './rentals/rentals.module';
import { ReservationsModule } from './reservations/reservations.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ZonesModule } from './zones/zones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    AuthModule,
    ZonesModule,
    VehiclesModule,
    ReservationsModule,
    RentalsModule,
    PaymentsModule,
    DispatchModule,
    InquiriesModule,
    BizModule,
    OpsModule,
    MetricsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
