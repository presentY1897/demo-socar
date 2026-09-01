import { Controller, Get, Query } from '@nestjs/common';
import { opsAccountingQuerySchema, type OpsAccountingQueryDto } from '@socar/shared';
import { Roles } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { OpsAccountingService } from './accounting.service';

/** 회계 탭 — 매출 − 비용 = 월 손익 (M3-3, 화면은 M3-6) */
@Roles('OPS_ADMIN')
@Controller('ops/accounting')
export class OpsAccountingController {
  constructor(private readonly accounting: OpsAccountingService) {}

  @Get('summary')
  summary(@Query(new ZodValidationPipe(opsAccountingQuerySchema)) query: OpsAccountingQueryDto) {
    return this.accounting.summary(query);
  }
}
