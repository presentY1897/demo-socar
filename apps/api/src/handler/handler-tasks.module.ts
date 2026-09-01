import { Module } from '@nestjs/common';
import { HandlerTasksService } from './handler-tasks.service';

/**
 * 작업 자동 생성 훅만 담은 얇은 모듈 — 예약/대여(M2-2)와 핸들러/운영 API(M2-3·M2-4)가
 * 함께 쓴다. 컨트롤러를 붙이지 않아 순환 의존 없이 어디서나 import할 수 있다.
 */
@Module({
  providers: [HandlerTasksService],
  exports: [HandlerTasksService],
})
export class HandlerTasksModule {}
