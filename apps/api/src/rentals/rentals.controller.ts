import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { extendRentalSchema, type ExtendRentalDto } from '@socar/shared';
import { CurrentUser } from '../auth/decorators';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RentalsService } from './rentals.service';

const startSchema = z.object({ reservationId: z.string().min(1) });

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

  /** 이용 중 반납 시각 연장 */
  @Post(':id/extend')
  extend(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extendRentalSchema)) dto: ExtendRentalDto,
  ) {
    return this.rentals.extend(user, id, dto);
  }

  /** 반납하기 — 주행거리는 텔레메트리(모의)로 자동 확정 */
  @Post(':id/return')
  requestReturn(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.rentals.requestReturn(user, id);
  }

  @Post(':id/settle')
  settle(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.rentals.settleReturn(user, id);
  }
}
