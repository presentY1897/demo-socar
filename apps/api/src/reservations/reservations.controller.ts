import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createReservationSchema,
  quoteRequestSchema,
  type CreateReservationDto,
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

  /** 결제 전 견적 (쿠폰/크레딧 반영) */
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
