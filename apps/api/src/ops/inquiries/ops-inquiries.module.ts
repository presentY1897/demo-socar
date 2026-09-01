import { Module } from '@nestjs/common';
import { OpsInquiriesController } from './inquiries.controller';
import { OpsInquiriesService } from './inquiries.service';

@Module({
  controllers: [OpsInquiriesController],
  providers: [OpsInquiriesService],
})
export class OpsInquiriesModule {}
