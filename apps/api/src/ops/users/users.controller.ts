import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../../auth/decorators';
import { OpsUsersService } from './users.service';

/** 고객 탭 — 유의 유저 집계와 개별 이력 (M3-3, 화면은 M3-5) */
@Roles('OPS_ADMIN')
@Controller('ops/users')
export class OpsUsersController {
  constructor(private readonly users: OpsUsersService) {}

  /** 임계치를 넘은 유저만 (최근 30일) */
  @Get('risk')
  risk() {
    return this.users.risk();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }
}
