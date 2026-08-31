import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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

  @Get('mine')
  mine(@CurrentUser() user: JwtUser) {
    return this.reservations.listMine(user.id);
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
