import { Module } from '@nestjs/common';
import { TravelModule } from '../dispatch/travel/travel.module';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  imports: [TravelModule],
  controllers: [ZonesController],
  providers: [ZonesService],
})
export class ZonesModule {}
