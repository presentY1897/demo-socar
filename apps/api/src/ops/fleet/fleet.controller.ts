import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  createMaintenanceNoteSchema,
  createOpsVehicleSchema,
  opsFleetQuerySchema,
  type CreateMaintenanceNoteDto,
  type CreateOpsVehicleDto,
  type OpsFleetQueryDto,
} from '@socar/shared';
import { CurrentUser, Roles } from '../../auth/decorators';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { OpsFleetService } from './fleet.service';

/** 차량(Fleet) 탭 — 목록·상세·정비 메모 (M3-3, 화면은 M3-4) */
@Roles('OPS_ADMIN')
@Controller('ops/fleet')
export class OpsFleetController {
  constructor(private readonly fleet: OpsFleetService) {}

  @Get()
  list(@Query(new ZodValidationPipe(opsFleetQuerySchema)) query: OpsFleetQueryDto) {
    return this.fleet.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.fleet.detail(id);
  }

  /** 정비 메모 — 덮어쓰지 않고 이력으로 쌓인다 */
  @Post(':id/notes')
  addNote(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createMaintenanceNoteSchema)) dto: CreateMaintenanceNoteDto,
  ) {
    return this.fleet.addNote(user, id, dto);
  }
}

/**
 * 요금제 목록 — 차량 등록 폼(M3-4)의 셀렉트 하나를 위한 읽기 전용 조회.
 * 등록 요청이 요금제 id를 요구하는데 그 id를 알 방법이 없으면 폼을 채울 수 없다.
 */
@Roles('OPS_ADMIN')
@Controller('ops/plans')
export class OpsPlansController {
  constructor(private readonly fleet: OpsFleetService) {}

  @Get()
  list() {
    return this.fleet.plans();
  }
}

/**
 * 차량 등록 — 목록(`/ops/fleet`)이 아니라 자원(`/ops/vehicles`)에 만든다.
 * 작업 문서의 경로를 그대로 따르고, 같은 서비스가 처리한다.
 */
@Roles('OPS_ADMIN')
@Controller('ops/vehicles')
export class OpsVehiclesController {
  constructor(private readonly fleet: OpsFleetService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createOpsVehicleSchema)) dto: CreateOpsVehicleDto) {
    return this.fleet.create(dto);
  }
}
