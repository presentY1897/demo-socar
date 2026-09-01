import { Module } from '@nestjs/common';
import { OpsReportsController } from './reports.controller';
import { OpsReportsService } from './reports.service';

@Module({
  controllers: [OpsReportsController],
  providers: [OpsReportsService],
  exports: [OpsReportsService], // Export(M4-4)가 같은 집계를 재사용한다
})
export class OpsReportsModule {}
