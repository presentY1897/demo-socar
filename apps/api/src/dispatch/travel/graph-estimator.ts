import { Injectable, Logger } from '@nestjs/common';
import { haversineMeters, type Coord } from '@socar/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { RoadGraph, type RoadGraphFile } from './road-graph';
import {
  HAVERSINE_DETOUR_FACTOR,
  WALK_SPEED_MPS,
  type TravelEstimate,
  type TravelTimeEstimator,
} from './travel-time';

/**
 * OSM 도로망 그래프 + A* 기반 도보 시간 추정.
 * region 그래프 파일이 없거나 그래프상 경로가 없으면 직선거리 × 우회계수로 폴백.
 */
@Injectable()
export class GraphTravelEstimator implements TravelTimeEstimator {
  private readonly logger = new Logger(GraphTravelEstimator.name);
  private readonly graphs = new Map<string, RoadGraph | null>();
  // API는 항상 apps/api를 cwd로 실행한다 (dev/prod/테스트 동일)
  private readonly dataDir =
    process.env.GRAPH_DATA_DIR ?? path.resolve(process.cwd(), 'data/graphs');

  async estimateWalk(from: Coord, to: Coord, region: string): Promise<TravelEstimate> {
    const graph = this.loadGraph(region);
    if (graph) {
      const a = graph.nearestNode(from);
      const b = graph.nearestNode(to);
      // 출발/도착점이 그래프에서 300m 이상 떨어져 있으면 스냅이 무의미 → 폴백
      if (a && b && a.meters < 300 && b.meters < 300) {
        const pathMeters = graph.shortestPathMeters(a.index, b.index);
        if (pathMeters !== null) {
          const meters = Math.round(a.meters + pathMeters + b.meters);
          return {
            meters,
            seconds: Math.round(meters / WALK_SPEED_MPS),
            method: 'graph-astar',
          };
        }
      }
    }

    const meters = Math.round(haversineMeters(from, to) * HAVERSINE_DETOUR_FACTOR);
    return { meters, seconds: Math.round(meters / WALK_SPEED_MPS), method: 'haversine' };
  }

  private loadGraph(region: string): RoadGraph | null {
    if (this.graphs.has(region)) return this.graphs.get(region)!;

    let graph: RoadGraph | null = null;
    const file = path.join(this.dataDir, `${region}.json.gz`);
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(file));
      const parsed = JSON.parse(raw.toString('utf8')) as RoadGraphFile;
      graph = new RoadGraph(parsed);
      this.logger.log(`도로망 그래프 로드: ${region} (${graph.nodeCount} nodes)`);
    } catch {
      this.logger.warn(`도로망 그래프 없음: ${file} — 직선거리 폴백 사용`);
    }
    this.graphs.set(region, graph);
    return graph;
  }
}
