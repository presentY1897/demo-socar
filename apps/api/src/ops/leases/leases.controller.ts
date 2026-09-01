import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  approveLeaseRequestSchema,
  rejectLeaseRequestSchema,
  type ApproveLeaseRequestDto,
  type RejectLeaseRequestDto,
} from '@socar/shared';
import { Roles } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { OpsLeasesService } from './leases.service';

/**
 * 운영 어드민의 리스 요청 처리 — 전역 역할(OPS_ADMIN)로 갈린다.
 * 법인 등급(`manageFleet`)은 `/biz` 쪽 권한이라 여기서는 쓰지 않는다.
 */
@Roles('OPS_ADMIN')
@Controller('ops/leases')
export class OpsLeasesController {
  constructor(private readonly leases: OpsLeasesService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.leases.list(status);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveLeaseRequestSchema)) dto: ApproveLeaseRequestDto,
  ) {
    return this.leases.approve(id, dto);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectLeaseRequestSchema)) dto: RejectLeaseRequestDto,
  ) {
    return this.leases.reject(id, dto);
  }
}
