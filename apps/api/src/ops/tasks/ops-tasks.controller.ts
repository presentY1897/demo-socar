import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  assignHandlerTaskSchema,
  createRepositionTaskSchema,
  opsTaskQuerySchema,
  type AssignHandlerTaskDto,
  type CreateRepositionTaskDto,
  type OpsTaskQueryDto,
} from '@socar/shared';
import { Roles } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { OpsTasksService } from './ops-tasks.service';

/** 운영 어드민의 작업 배정 (M2-4) — 화면은 M3-6 */
@Roles('OPS_ADMIN')
@Controller('ops/tasks')
export class OpsTasksController {
  constructor(private readonly tasks: OpsTasksService) {}

  /** 전체 작업 목록 (상태·타입·기한 날짜 필터) */
  @Get()
  list(@Query(new ZodValidationPipe(opsTaskQuerySchema)) query: OpsTaskQueryDto) {
    return this.tasks.list(query);
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
