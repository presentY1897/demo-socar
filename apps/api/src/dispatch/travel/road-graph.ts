import { haversineMeters, type Coord } from '@socar/shared';

/**
 * 경량 도로망 그래프.
 * data/graphs/{region}.json.gz — scripts/build-graph.ts가 OSM(Overpass)에서 생성.
 * 파일 포맷: { region, nodes: [lat, lng][], edges: [aIdx, bIdx, meters][] }
 */
export interface RoadGraphFile {
  region: string;
  nodes: [number, number][];
  edges: [number, number, number][];
}

interface AdjEntry {
  to: number;
  meters: number;
}

/** 이진 최소 힙 (A* 우선순위 큐) */
class MinHeap {
  private items: { node: number; priority: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(node: number, priority: number) {
    const arr = this.items;
    arr.push({ node, priority });
    let i = arr.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (arr[parent].priority <= arr[i].priority) break;
      [arr[parent], arr[i]] = [arr[i], arr[parent]];
      i = parent;
    }
  }

  pop(): { node: number; priority: number } | undefined {
    const arr = this.items;
    if (arr.length === 0) return undefined;
    const top = arr[0];
    const last = arr.pop()!;
    if (arr.length > 0) {
      arr[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < arr.length && arr[l].priority < arr[smallest].priority) smallest = l;
        if (r < arr.length && arr[r].priority < arr[smallest].priority) smallest = r;
        if (smallest === i) break;
        [arr[smallest], arr[i]] = [arr[i], arr[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

const GRID_CELL_DEG = 0.005; // ≈ 550m — 최근접 노드 탐색용 격자 인덱스

export class RoadGraph {
  private readonly nodes: [number, number][];
  private readonly adj: AdjEntry[][];
  private readonly grid = new Map<string, number[]>();

  constructor(file: RoadGraphFile) {
    this.nodes = file.nodes;
    this.adj = this.nodes.map(() => []);
    for (const [a, b, meters] of file.edges) {
      this.adj[a].push({ to: b, meters });
      this.adj[b].push({ to: a, meters });
    }
    this.nodes.forEach(([lat, lng], i) => {
      const key = this.cellKey(lat, lng);
      const cell = this.grid.get(key);
      if (cell) cell.push(i);
      else this.grid.set(key, [i]);
    });
  }

  get nodeCount() {
    return this.nodes.length;
  }

  private cellKey(lat: number, lng: number): string {
    return `${Math.floor(lat / GRID_CELL_DEG)}:${Math.floor(lng / GRID_CELL_DEG)}`;
  }

  /** 격자 인덱스로 최근접 노드 탐색 (반경을 넓혀가며 3링까지) */
  nearestNode(p: Coord): { index: number; meters: number } | null {
    const baseLat = Math.floor(p.lat / GRID_CELL_DEG);
    const baseLng = Math.floor(p.lng / GRID_CELL_DEG);
    let best: { index: number; meters: number } | null = null;

    for (let ring = 0; ring <= 3; ring++) {
      for (let dLat = -ring; dLat <= ring; dLat++) {
        for (let dLng = -ring; dLng <= ring; dLng++) {
          if (Math.max(Math.abs(dLat), Math.abs(dLng)) !== ring) continue;
          const cell = this.grid.get(`${baseLat + dLat}:${baseLng + dLng}`);
          if (!cell) continue;
          for (const i of cell) {
            const meters = haversineMeters(p, { lat: this.nodes[i][0], lng: this.nodes[i][1] });
            if (!best || meters < best.meters) best = { index: i, meters };
          }
        }
      }
      if (best && ring >= 1) break; // 한 링 더 확인 후 종료
    }
    return best;
  }

  /** A* 최단 경로 거리(미터). 경로가 없으면 null */
  shortestPathMeters(fromIdx: number, toIdx: number): number | null {
    const target: Coord = { lat: this.nodes[toIdx][0], lng: this.nodes[toIdx][1] };
    const h = (i: number) =>
      haversineMeters({ lat: this.nodes[i][0], lng: this.nodes[i][1] }, target);

    const dist = new Map<number, number>();
    const heap = new MinHeap();
    dist.set(fromIdx, 0);
    heap.push(fromIdx, h(fromIdx));

    while (heap.size > 0) {
      const { node } = heap.pop()!;
      if (node === toIdx) return dist.get(node)!;
      const d = dist.get(node)!;
      for (const { to, meters } of this.adj[node]) {
        const nd = d + meters;
        const known = dist.get(to);
        if (known === undefined || nd < known) {
          dist.set(to, nd);
          heap.push(to, nd + h(to));
        }
      }
    }
    return null;
  }
}
