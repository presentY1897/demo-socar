import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller';

@Module({
  controllers: [ZonesController],
})
export class ZonesModule {}
