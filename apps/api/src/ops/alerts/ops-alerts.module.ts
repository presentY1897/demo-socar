import { Module } from '@nestjs/common';
import { OpsAlertsController } from './alerts.controller';
import { OpsAlertsService } from './alerts.service';

@Module({
  controllers: [OpsAlertsController],
  providers: [OpsAlertsService],
})
export class OpsAlertsModule {}
