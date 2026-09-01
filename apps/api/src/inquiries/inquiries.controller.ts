import { Body, Controller, Get, Post } from '@nestjs/common';
import { createInquirySchema, type CreateInquiryDto } from '@socar/shared';
import { CurrentUser } from '../auth/decorators';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(createInquirySchema)) dto: CreateInquiryDto,
  ) {
    return this.inquiries.create(user, dto);
  }
}

/** 내 문의함 — `/me` 네임스페이스지만 도메인은 문의라 이 모듈에 둔다 */
@Controller('me/inquiries')
export class MyInquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Get()
  mine(@CurrentUser() user: JwtUser) {
    return this.inquiries.listMine(user.id);
  }
}
