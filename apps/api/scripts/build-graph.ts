/**
 * 전국 도로망 그래프 빌드 파이프라인.
 *
 * OSM(Overpass API)에서 보행 가능 도로를 받아 지역별 경량 그래프로 변환한다.
 * 전국 어느 지역이든 REGIONS에 중심 좌표만 추가하면 그래프를 만들 수 있고,
 * 저장소/배포본에는 존이 있는 지역의 그래프만 싣는다 (무료 티어 메모리 대응).
 *
 * 사용법:
 *   pnpm --filter @socar/api build:graph            # 모든 지역
 *   pnpm --filter @socar/api build:graph -- seoul   # 특정 지역만
 *
 * 산출물: apps/api/data/graphs/{region}.json.gz
 *   { region, nodes: [lat,lng][], edges: [aIdx,bIdx,meters][] }
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { REGIONS } from './regions';

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
/** 중심 좌표 기준 상자 반경(도 단위, 위도 0.02° ≈ 2.2km) */
const BOX_HALF_DEG = 0.02;

const WALKABLE_HIGHWAY =
  '^(primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|pedestrian|footway|path|steps|service)$';

interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}
interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

async function fetchBox(south: number, west: number, north: number, east: number) {
  const query = `[out:json][timeout:90];
way["highway"~"${WALKABLE_HIGHWAY}"](${south},${west},${north},${east});
out body;
>;
out skel qt;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { elements: (OsmNode | OsmWay)[] };
}

/** union-find로 최대 연결 요소만 남긴다 (고립 파편 제거) */
function largestComponent(nodeCount: number, edges: [number, number, number][]) {
  const parent = Array.from({ length: nodeCount }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const [a, b] of edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < nodeCount; i++) {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  let bestRoot = -1;
  let bestSize = 0;
  for (const [root, size] of sizes) {
    if (size > bestSize) {
      bestSize = size;
      bestRoot = root;
    }
  }
  return { keep: (i: number) => find(i) === bestRoot, size: bestSize };
}

async function buildRegion(region: string, centers: { lat: number; lng: number }[]) {
  console.log(`\n[${region}] ${centers.length}개 영역 조회 중...`);
  const nodeById = new Map<number, OsmNode>();
  const wayById = new Map<number, OsmWay>();

  for (const { lat, lng } of centers) {
    // 경도는 위도에 따라 실거리가 줄어들므로 cos 보정으로 정사각형에 가깝게
    const lngHalf = BOX_HALF_DEG / Math.cos((lat * Math.PI) / 180);
    const data = await fetchBox(lat - BOX_HALF_DEG, lng - lngHalf, lat + BOX_HALF_DEG, lng + lngHalf);
    for (const el of data.elements) {
      if (el.type === 'node') nodeById.set(el.id, el);
      else if (el.type === 'way') wayById.set(el.id, el);
    }
    console.log(`  box(${lat.toFixed(3)},${lng.toFixed(3)}) → 누적 nodes=${nodeById.size} ways=${wayById.size}`);
    await new Promise((r) => setTimeout(r, 1500)); // Overpass 부하 배려
  }

  // OSM id → 로컬 인덱스 (실제 way에 쓰인 노드만)
  const indexById = new Map<number, number>();
  const nodes: [number, number][] = [];
  const edges: [number, number, number][] = [];

  const indexOf = (osmId: number): number | null => {
    const existing = indexById.get(osmId);
    if (existing !== undefined) return existing;
    const n = nodeById.get(osmId);
    if (!n) return null;
    const idx = nodes.length;
    nodes.push([Math.round(n.lat * 1e6) / 1e6, Math.round(n.lon * 1e6) / 1e6]);
    indexById.set(osmId, idx);
    return idx;
  };

  for (const way of wayById.values()) {
    for (let i = 0; i + 1 < way.nodes.length; i++) {
      const a = indexOf(way.nodes[i]);
      const b = indexOf(way.nodes[i + 1]);
      if (a === null || b === null || a === b) continue;
      const meters = Math.round(
        haversineMeters(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1]),
      );
      edges.push([a, b, Math.max(meters, 1)]);
    }
  }

  const { keep, size } = largestComponent(nodes.length, edges);
  const remap = new Map<number, number>();
  const keptNodes: [number, number][] = [];
  nodes.forEach((n, i) => {
    if (keep(i)) {
      remap.set(i, keptNodes.length);
      keptNodes.push(n);
    }
  });
  const keptEdges = edges
    .filter(([a, b]) => keep(a) && keep(b))
    .map(([a, b, m]) => [remap.get(a)!, remap.get(b)!, m] as [number, number, number]);

  console.log(
    `  그래프: ${nodes.length} → ${size} nodes (최대 연결요소), ${keptEdges.length} edges`,
  );

  const outDir = path.resolve(__dirname, '../data/graphs');
  fs.mkdirSync(outDir, { recursive: true });
  const payload = JSON.stringify({ region, nodes: keptNodes, edges: keptEdges });
  const outFile = path.join(outDir, `${region}.json.gz`);
  fs.writeFileSync(outFile, zlib.gzipSync(Buffer.from(payload), { level: 9 }));
  console.log(`  저장: ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)}KB)`);
}

async function main() {
  const only = process.argv[2];
  const targets = only ? { [only]: REGIONS[only] } : REGIONS;
  if (only && !REGIONS[only]) {
    console.error(`알 수 없는 지역: ${only} (가능: ${Object.keys(REGIONS).join(', ')})`);
    process.exit(1);
  }
  for (const [region, centers] of Object.entries(targets)) {
    await buildRegion(region, centers);
  }
}

void main();
