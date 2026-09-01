import { Module } from '@nestjs/common';
import { OpsFleetController, OpsPlansController, OpsVehiclesController } from './fleet.controller';
import { OpsFleetService } from './fleet.service';

@Module({
  controllers: [OpsFleetController, OpsPlansController, OpsVehiclesController],
  providers: [OpsFleetService],
})
export class OpsFleetModule {}
