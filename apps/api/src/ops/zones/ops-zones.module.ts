import { Module } from '@nestjs/common';
import { OpsZonesController } from './zones.controller';
import { OpsZonesService } from './zones.service';

@Module({
  controllers: [OpsZonesController],
  providers: [OpsZonesService],
})
export class OpsZonesModule {}
