import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RentalsService } from './rentals.service';

const startSchema = z.object({ reservationId: z.string().min(1) });
const returnSchema = z.object({ distanceKm: z.number().min(0).max(5000) });

@Controller('rentals')
export class RentalsController {
  constructor(private readonly rentals: RentalsService) {}

  @Post('start')
  start(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(startSchema)) dto: { reservationId: string },
  ) {
    return this.rentals.start(user, dto.reservationId);
  }

  @Post(':id/return')
  requestReturn(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(returnSchema)) dto: { distanceKm: number },
  ) {
    return this.rentals.requestReturn(user, id, dto.distanceKm);
  }

  @Post(':id/settle')
  settle(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.rentals.settleReturn(user, id);
  }
}
