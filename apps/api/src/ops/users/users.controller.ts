import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators';
import {
  buildExportFile,
  exportDateStamp,
  parseExportFormat,
  respondExport,
} from '../../common/export/export';
import { USERS_RISK_EXPORT } from './users-export';
import { OpsUsersService } from './users.service';

/** 고객 탭 — 유의 유저 집계와 개별 이력 (M3-3, 화면은 M3-5) */
@Roles('OPS_ADMIN')
@Controller('ops/users')
export class OpsUsersController {
  constructor(private readonly users: OpsUsersService) {}

  /** 임계치를 넘은 유저만 (최근 30일). `?format=`이면 파일로 (M4-4) */
  @Get('risk')
  async risk(
    @Query('format') rawFormat: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.users.risk();
    const format = parseExportFormat(rawFormat);
    if (!format) return rows;
    return respondExport(
      res,
      buildExportFile({ format, spec: USERS_RISK_EXPORT, rows, parts: [exportDateStamp()] }),
    );
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }
}
