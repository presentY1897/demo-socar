import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { reportQuerySchema, type ReportQueryDto } from '@socar/shared';
import { Roles } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import {
  buildExportFile,
  parseExportFormat,
  respondExport,
} from '../../common/export/export';
import { reportExportSpec, reportFilenameParts } from './reports-export';
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

  /** `?format=csv|json`이면 파일로 — 차트가 본 것과 **같은 응답**을 그대로 편다 (M4-4) */
  @Get()
  async build(
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQueryDto,
    @Query('format') rawFormat: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.reports.build(query);
    const format = parseExportFormat(rawFormat);
    if (!format) return report;
    return respondExport(
      res,
      buildExportFile({
        format,
        spec: reportExportSpec(report.meta),
        rows: report.rows,
        // JSON은 meta까지 통째로 — 무슨 조건으로 뽑은 값인지가 파일 안에 남는다
        json: report,
        parts: reportFilenameParts(report.meta),
      }),
    );
  }
}
