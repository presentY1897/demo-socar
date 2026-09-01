import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { completeHandlerTaskSchema, type CompleteHandlerTaskDto } from '@socar/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { HandlerService } from './handler.service';

/** 핸들러(운송기사) 전용 — 현장에서 자기 작업을 받아 처리한다 (M2-3) */
@Roles('HANDLER')
@Controller('handler/tasks')
export class HandlerController {
  constructor(private readonly handler: HandlerService) {}

  /** 내 작업(오늘/예정) + 수락 가능한 공개 작업 + 최근 완료 이력 */
  @Get()
  queue(@CurrentUser() user: JwtUser) {
    return this.handler.queue(user);
  }

  /** 공개 작업 수락 */
  @Post(':id/accept')
  accept(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.handler.accept(user, id);
  }

  /** 이동 시작 */
  @Post(':id/start')
  start(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.handler.start(user, id);
  }

  /** 완료 — 인계 사진 + 메모 필수. 차량의 실제 위치·상태가 이때 갱신된다 */
  @Post(':id/complete')
  complete(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeHandlerTaskSchema)) dto: CompleteHandlerTaskDto,
  ) {
    return this.handler.complete(user, id, dto);
  }
}
