import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  extendLeaseRequestSchema,
  terminateLeaseRequestSchema,
  type ExtendLeaseRequestDto,
  type TerminateLeaseRequestDto,
} from '@socar/shared';
import { CurrentUser } from '../../auth/decorators';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CorpPermissionGuard, RequireCorpPermission } from '../corp-permission.guard';
import { LeasesService } from './leases.service';

/**
 * 리스 계약 조회 + 연장/해지 요청 — `manageFleet` 권한(MANAGER)만.
 * 요청의 승인/반려는 법인이 아니라 운영 어드민(`/ops/leases`)이 한다.
 */
@UseGuards(CorpPermissionGuard)
@RequireCorpPermission('manageFleet')
@Controller('biz/leases')
export class LeasesController {
  constructor(private readonly leases: LeasesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.leases.list(user);
  }

  @Post(':id/extend-request')
  extend(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extendLeaseRequestSchema)) dto: ExtendLeaseRequestDto,
  ) {
    return this.leases.requestExtension(user, id, dto);
  }

  @Post(':id/terminate-request')
  terminate(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(terminateLeaseRequestSchema)) dto: TerminateLeaseRequestDto,
  ) {
    return this.leases.requestTermination(user, id, dto);
  }
}
