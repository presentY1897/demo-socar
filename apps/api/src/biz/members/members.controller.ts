import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { updateCorpGradeSchema, type UpdateCorpGradeDto } from '@socar/shared';
import { CurrentUser } from '../../auth/decorators';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CorpPermissionGuard, RequireCorpPermission } from '../corp-permission.guard';
import { MembersService } from './members.service';

/** 법인 멤버 등급 관리 — `manageMembers` 권한(MANAGER)만 */
@UseGuards(CorpPermissionGuard)
@RequireCorpPermission('manageMembers')
@Controller('biz/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.members.list(user);
  }

  @Patch(':id/grade')
  updateGrade(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCorpGradeSchema)) dto: UpdateCorpGradeDto,
  ) {
    return this.members.updateGrade(user, id, dto.grade);
  }
}
