import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  createReservationSchema,
  modifyReservationSchema,
  quoteRequestSchema,
  type CreateReservationDto,
  type ModifyReservationDto,
  type QuoteRequestDto,
  validateSlotRange,
} from '@socar/shared';
import { BadRequestException } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildExportFile,
  exportDateStamp,
  parseExportFormat,
  respondExport,
} from '../common/export/export';
import { MY_RESERVATIONS_EXPORT, type MyReservationRow } from './reservations-export';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly prisma: PrismaService,
  ) {}

  /** 결제 전 견적 (쿠폰/크레딧/편도 수수료 반영) */
  @Post('quote')
  async quote(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(quoteRequestSchema)) dto: QuoteRequestDto,
  ) {
    const rangeError = validateSlotRange(new Date(dto.startAt), new Date(dto.endAt));
    if (rangeError) throw new BadRequestException(rangeError);
    const { breakdown } = await this.reservations.quoteFor(this.prisma, user.id, dto);
    return breakdown;
  }

  /** 이용 전 예약 시간 변경 (차액 추가 결제 / 크레딧 환급) */
  @Patch(':id')
  modify(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(modifyReservationSchema)) dto: ModifyReservationDto,
  ) {
    return this.reservations.modify(user, id, dto);
  }

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(createReservationSchema)) dto: CreateReservationDto,
  ) {
    return this.reservations.create(user, dto);
  }

  /**
   * 내 예약 목록. `?format=csv|json`이면 파일로 내려간다 (M4-4).
   * 조회가 이미 로그인 사용자로 좁혀져 있어 Export도 **자기 예약만** 나간다.
   */
  @Get('mine')
  async mine(
    @CurrentUser() user: JwtUser,
    @Query('format') rawFormat: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.reservations.listMine(user.id);
    const format = parseExportFormat(rawFormat);
    if (!format) return rows;
    return respondExport(
      res,
      buildExportFile({
        format,
        spec: MY_RESERVATIONS_EXPORT,
        rows: rows as unknown as MyReservationRow[],
        parts: [exportDateStamp()],
      }),
    );
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.reservations.detail(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.reservations.cancel(user, id);
  }
}
