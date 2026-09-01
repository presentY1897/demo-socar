import { Module } from '@nestjs/common';
import { TravelModule } from '../dispatch/travel/travel.module';
import { HandlerController } from './handler.controller';
import { HandlerService } from './handler.service';

@Module({
  imports: [TravelModule],
  controllers: [HandlerController],
  providers: [HandlerService],
})
export class HandlerModule {}
