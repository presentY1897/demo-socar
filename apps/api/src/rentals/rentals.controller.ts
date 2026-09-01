import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  checkInSchema,
  checkOutSchema,
  extendRentalSchema,
  type CheckInDto,
  type CheckOutDto,
  type ExtendRentalDto,
} from '@socar/shared';
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

  /** 체크인 — 차량 상태 메모 + 사진. 제출해야 스마트키(M1-4)가 열린다 */
  @Post(':id/check-in')
  checkIn(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(checkInSchema)) dto: CheckInDto,
  ) {
    return this.rentals.checkIn(user, id, dto);
  }

  /** 체크아웃 — 주차 위치 사진 + 층/구역 메모. 제출해야 반납이 열린다 */
  @Post(':id/check-out')
  checkOut(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(checkOutSchema)) dto: CheckOutDto,
  ) {
    return this.rentals.checkOut(user, id, dto);
  }

  /** 단계형 화면이 현재 단계를 판단하는 이용 상태 요약 */
  @Get(':id/usage')
  usage(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.rentals.usage(user, id);
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
