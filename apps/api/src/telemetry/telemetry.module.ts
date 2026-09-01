import { Global, Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';

/**
 * 차량 텔레메트리 — 이용(rentals)·핸들러 작업(handler)·운영 조회(ops)·SSE(metrics)가 모두 읽는다.
 * 도메인 모듈마다 import 목록을 늘리는 대신 전역 모듈로 둔다 (PrismaModule과 같은 성격).
 */
@Global()
@Module({
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
