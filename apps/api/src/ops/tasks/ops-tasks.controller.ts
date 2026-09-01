import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  HANDLER_TASK_STATUS_META,
  HANDLER_TASK_TYPE_META,
  assignHandlerTaskSchema,
  createRepositionTaskSchema,
  opsTaskQuerySchema,
  type AssignHandlerTaskDto,
  type CreateRepositionTaskDto,
  type OpsTaskQueryDto,
} from '@socar/shared';
import { Roles } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import {
  buildExportFile,
  exportDateStamp,
  parseExportFormat,
  respondExport,
} from '../../common/export/export';
import { TASKS_EXPORT } from './tasks-export';
import { OpsTasksService } from './ops-tasks.service';

/** 운영 어드민의 작업 배정 (M2-4) — 화면은 M3-6 */
@Roles('OPS_ADMIN')
@Controller('ops/tasks')
export class OpsTasksController {
  constructor(private readonly tasks: OpsTasksService) {}

  /** 전체 작업 목록 (상태·타입·기한 날짜 필터). `?format=`이면 파일로 (M4-4) */
  @Get()
  async list(
    @Query(new ZodValidationPipe(opsTaskQuerySchema)) query: OpsTaskQueryDto,
    @Query('format') rawFormat: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.tasks.list(query);
    const format = parseExportFormat(rawFormat);
    if (!format) return rows;
    return respondExport(
      res,
      buildExportFile({
        format,
        spec: TASKS_EXPORT,
        rows,
        parts: [
          query.status ? HANDLER_TASK_STATUS_META[query.status].label : null,
          query.type ? HANDLER_TASK_TYPE_META[query.type].label : null,
          query.date ?? exportDateStamp(),
        ],
      }),
    );
  }

  /** 재배치 작업 수동 생성 */
  @Post()
  create(
    @Body(new ZodValidationPipe(createRepositionTaskSchema)) dto: CreateRepositionTaskDto,
  ) {
    return this.tasks.createReposition(dto);
  }

  /** 이 작업을 맡길 핸들러 후보 — 마지막 완료 지점에서 가까운 순 */
  @Get(':id/candidates')
  candidates(@Param('id') id: string) {
    return this.tasks.candidates(id);
  }

  /** 배정·재배정 (이동 시작 전까지) */
  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignHandlerTaskSchema)) dto: AssignHandlerTaskDto,
  ) {
    return this.tasks.assign(id, dto);
  }
}
