import type { Coord } from '@socar/shared';

export interface TravelEstimate {
  seconds: number;
  meters: number;
  /** 어떤 방식으로 추정했는지 — 근거 표시용 */
  method: 'graph-astar' | 'haversine';
}

/**
 * 사람 이동 시간 추정기.
 * 기본 구현은 OSM 그래프 + A* (GraphTravelEstimator).
 * 실서비스 전환 시 Kakao Mobility 등 외부 API 구현체로 교체하는 지점.
 */
export interface TravelTimeEstimator {
  estimateWalk(from: Coord, to: Coord, region: string): Promise<TravelEstimate>;
}

export const TRAVEL_ESTIMATOR = Symbol('TRAVEL_ESTIMATOR');

export const WALK_SPEED_MPS = 1.25; // 도보 4.5km/h
/** 직선거리 폴백 시 실제 경로 우회 보정 계수 */
export const HAVERSINE_DETOUR_FACTOR = 1.3;
