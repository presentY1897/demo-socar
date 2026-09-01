import { Module } from '@nestjs/common';
import { InquiriesController, MyInquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';

@Module({
  controllers: [InquiriesController, MyInquiriesController],
  providers: [InquiriesService],
})
export class InquiriesModule {}
