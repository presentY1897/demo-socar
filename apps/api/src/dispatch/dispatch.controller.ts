import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  approveDispatchSchema,
  createDispatchRequestSchema,
  rejectDispatchSchema,
  type ApproveDispatchDto,
  type CreateDispatchRequestDto,
  type RejectDispatchDto,
} from '@socar/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DispatchService } from './dispatch.service';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Roles('CORP_MEMBER', 'CORP_ADMIN')
  @Post('requests')
  create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(createDispatchRequestSchema)) dto: CreateDispatchRequestDto,
  ) {
    return this.dispatch.createRequest(user, dto);
  }

  @Roles('CORP_MEMBER', 'CORP_ADMIN')
  @Get('requests')
  list(@CurrentUser() user: JwtUser) {
    return this.dispatch.list(user);
  }

  @Roles('CORP_ADMIN')
  @Get('board')
  board(@CurrentUser() user: JwtUser, @Query('date') date: string) {
    return this.dispatch.board(user, date ?? '');
  }

  @Roles('CORP_MEMBER', 'CORP_ADMIN', 'OPS_ADMIN')
  @Get('requests/:id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.dispatch.detail(user, id);
  }

  @Roles('CORP_ADMIN')
  @Post('requests/:id/approve')
  approve(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveDispatchSchema)) dto: ApproveDispatchDto,
  ) {
    return this.dispatch.approve(user, id, dto.candidateId);
  }

  @Roles('CORP_ADMIN')
  @Post('requests/:id/reject')
  reject(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectDispatchSchema)) dto: RejectDispatchDto,
  ) {
    return this.dispatch.reject(user, id, dto.reason);
  }
}
