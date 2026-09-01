import { Module } from '@nestjs/common';
import { OpsFleetController, OpsVehiclesController } from './fleet.controller';
import { OpsFleetService } from './fleet.service';

@Module({
  controllers: [OpsFleetController, OpsVehiclesController],
  providers: [OpsFleetService],
})
export class OpsFleetModule {}
