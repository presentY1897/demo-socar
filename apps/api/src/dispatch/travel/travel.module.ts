import { Module } from '@nestjs/common';
import { GraphTravelEstimator } from './graph-estimator';
import { TRAVEL_ESTIMATOR } from './travel-time';

@Module({
  providers: [{ provide: TRAVEL_ESTIMATOR, useClass: GraphTravelEstimator }],
  exports: [TRAVEL_ESTIMATOR],
})
export class TravelModule {}
