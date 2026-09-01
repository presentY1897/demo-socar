/**
 * 이동시간 추정(A* / 직선거리 폴백) — biz 전용이 아니라 zones·reservations·biz가 함께 쓰는
 * 공용 인프라다. 배차가 처음 도입해 `src/dispatch/` 아래에 남아 있을 뿐이며,
 * 위치는 `src/common/travel/`이 맞다. (임포터가 M1 병행 작업 영역이라 이동은 ADR-010 대상)
 */
import { Module } from '@nestjs/common';
import { GraphTravelEstimator } from './graph-estimator';
import { TRAVEL_ESTIMATOR } from './travel-time';

@Module({
  providers: [{ provide: TRAVEL_ESTIMATOR, useClass: GraphTravelEstimator }],
  exports: [TRAVEL_ESTIMATOR],
})
export class TravelModule {}
