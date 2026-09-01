import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  approveDispatchSchema,
  createDispatchRequestSchema,
  rejectDispatchSchema,
  type ApproveDispatchDto,
  type CreateDispatchRequestDto,
  type RejectDispatchDto,
} from '@socar/shared';
import { CurrentUser } from '../../auth/decorators';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CorpPermissionGuard, RequireCorpPermission } from '../corp-permission.guard';
import { DispatchService } from './dispatch.service';

/**
 * 법인 배차 — biz 네임스페이스(`/biz/dispatch/*`). 구 경로 `/dispatch/*`는 폐기됐다.
 *
 * 접근 제어는 전역 역할(Role)이 아니라 **법인 등급**으로 한다 — 등급→권한 매핑은
 * shared `CORP_PERMISSIONS`가 단일 소스이고, 여기서는 필요한 권한 키만 선언한다.
 */
@UseGuards(CorpPermissionGuard)
@Controller('biz/dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @RequireCorpPermission('createRequest')
  @Post('requests')
  create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(createDispatchRequestSchema)) dto: CreateDispatchRequestDto,
  ) {
    return this.dispatch.createRequest(user, dto);
  }

  @RequireCorpPermission('viewDispatch')
  @Get('requests')
  list(@CurrentUser() user: JwtUser) {
    return this.dispatch.list(user);
  }

  @RequireCorpPermission('viewBoard')
  @Get('board')
  board(@CurrentUser() user: JwtUser, @Query('date') date: string) {
    return this.dispatch.board(user, date ?? '');
  }

  @RequireCorpPermission('viewDispatch')
  @Get('requests/:id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.dispatch.detail(user, id);
  }

  @RequireCorpPermission('approve')
  @Post('requests/:id/approve')
  approve(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveDispatchSchema)) dto: ApproveDispatchDto,
  ) {
    return this.dispatch.approve(user, id, dto.candidateId);
  }

  @RequireCorpPermission('approve')
  @Post('requests/:id/reject')
  reject(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectDispatchSchema)) dto: RejectDispatchDto,
  ) {
    return this.dispatch.reject(user, id, dto.reason);
  }
}
