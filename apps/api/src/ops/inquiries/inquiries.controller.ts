import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  answerInquirySchema,
  opsInquiryQuerySchema,
  type AnswerInquiryDto,
  type OpsInquiryQueryDto,
} from '@socar/shared';
import { CurrentUser, Roles } from '../../auth/decorators';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { OpsInquiriesService } from './inquiries.service';

/** 문의함 — 접수는 M1-7(`POST /inquiries`), 답변은 여기 (화면은 M3-5) */
@Roles('OPS_ADMIN')
@Controller('ops/inquiries')
export class OpsInquiriesController {
  constructor(private readonly inquiries: OpsInquiriesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(opsInquiryQuerySchema)) query: OpsInquiryQueryDto) {
    return this.inquiries.list(query);
  }

  @Post(':id/answer')
  answer(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(answerInquirySchema)) dto: AnswerInquiryDto,
  ) {
    return this.inquiries.answer(user, id, dto);
  }
}
