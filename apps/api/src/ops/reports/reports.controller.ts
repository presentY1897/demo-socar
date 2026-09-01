import { Controller, Get, Query } from '@nestjs/common';
import { reportQuerySchema, type ReportQueryDto } from '@socar/shared';
import { Roles } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { OpsReportsService } from './reports.service';

/**
 * 리포트 빌더 (M4-2) — 지표 5종을 기간·축·필터로 조합해 한 형태로 낸다.
 *
 * 차트(M4-3)와 Export(M4-4)가 같은 응답을 나눠 쓴다. 허용되지 않는 metric×groupBy 조합은
 * shared의 지표 사전이 판정해 400으로 막는다 — 화면과 API가 같은 표를 본다.
 */
@Roles('OPS_ADMIN')
@Controller('ops/reports')
export class OpsReportsController {
  constructor(private readonly reports: OpsReportsService) {}

  /** 필터 폼의 선택지 (존·차종) — 리포트 본문보다 먼저 잡아야 경로가 :id로 먹히지 않는다 */
  @Get('options')
  options() {
    return this.reports.options();
  }

  @Get()
  build(@Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQueryDto) {
    return this.reports.build(query);
  }
}
