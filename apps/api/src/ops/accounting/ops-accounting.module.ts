import { Module } from '@nestjs/common';
import { OpsAccountingController } from './accounting.controller';
import { OpsAccountingService } from './accounting.service';

@Module({
  controllers: [OpsAccountingController],
  providers: [OpsAccountingService],
})
export class OpsAccountingModule {}
