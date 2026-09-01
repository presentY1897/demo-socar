/**
 * 이동시간 추정(A* / 직선거리 폴백) — 공용 인프라.
 * 배차(biz)가 처음 도입했지만 존 탐색(zones)·부름 가용성(reservations)도 같은 추정기를 쓴다.
 * 그래서 특정 컨텍스트가 아니라 `src/common/` 아래에 둔다 (ADR-010 잔여 결합 #3 해소).
 */
import { Module } from '@nestjs/common';
import { GraphTravelEstimator } from './graph-estimator';
import { TRAVEL_ESTIMATOR } from './travel-time';

@Module({
  providers: [{ provide: TRAVEL_ESTIMATOR, useClass: GraphTravelEstimator }],
  exports: [TRAVEL_ESTIMATOR],
})
export class TravelModule {}
