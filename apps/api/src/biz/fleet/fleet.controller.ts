import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { CorpPermissionGuard, RequireCorpPermission } from '../corp-permission.guard';
import { FleetService } from './fleet.service';

/** 법인 플릿(리스 차량) 현황 — `manageFleet` 권한(MANAGER)만 */
@UseGuards(CorpPermissionGuard)
@RequireCorpPermission('manageFleet')
@Controller('biz/fleet')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.fleet.list(user);
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.fleet.detail(user, id);
  }
}
