/**
 * 존(공유 주차장) 실데이터 파이프라인.
 *
 * 소스 두 곳을 병합해 거점(scripts/regions.ts) 반경 2km의 실제 주차장을 존으로 선별한다:
 *  1. 전국주차장정보표준데이터 (공공데이터포털 JSON 다운로드) — 이름/주소/면수가 정확
 *  2. OSM amenity=parking (Overpass) — 표준데이터가 비는 지역 보충
 *
 * 사용법:
 *   pnpm --filter @socar/api build:zones -- --std /path/to/전국주차장정보표준데이터.json
 *   (표준데이터 생략 시 OSM만으로 생성. OVERPASS_URL로 미러 지정 가능)
 *
 * 산출물: apps/api/data/zones.json — 시드가 이 파일을 읽는다 (없으면 내장 기본값)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZONE_CENTERS, type RegionCenter } from './regions';

const OVERPASS_URL = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 2000; // 도로망 그래프 bbox(±2.2km) 안쪽
const PER_CENTER = 3;
const DEDUPE_M = 150;

interface ZoneSeed {
  name: string;
  region: string;
  address: string;
  lat: number;
  lng: number;
  capacity: number;
  source: 'kr-standard-data' | 'osm';
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// ── 소스 1: 전국주차장정보표준데이터 ──
interface StdRecord {
  주차장명?: string;
  주차장구분?: string;
  소재지도로명주소?: string;
  소재지지번주소?: string;
  주차구획수?: string;
  위도?: string;
  경도?: string;
}

function loadStandardData(file: string) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) as {
    records: StdRecord[];
  };
  const rows: { name: string; addr: string; lat: number; lng: number; capacity: number; public_: boolean }[] = [];
  for (const r of parsed.records) {
    const lat = Number(r.위도);
    const lng = Number(r.경도);
    const name = r.주차장명?.trim();
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) continue;
    rows.push({
      name: name.includes('주차장') ? name : `${name} 주차장`,
      addr: r.소재지도로명주소?.trim() || r.소재지지번주소?.trim() || '',
      lat,
      lng,
      capacity: Math.max(2, Number(r.주차구획수) || 10),
      public_: r.주차장구분 === '공영',
    });
  }
  console.log(`표준데이터 로드: ${rows.length}건 (좌표·이름 보유)`);
  return rows;
}

// ── 소스 2: OSM amenity=parking ──
async function fetchOsmParking(center: RegionCenter) {
  const lngHalf = 0.02 / Math.cos((center.lat * Math.PI) / 180);
  const bbox = `${center.lat - 0.02},${center.lng - lngHalf},${center.lat + 0.02},${center.lng + lngHalf}`;
  const query = `[out:json][timeout:60];nwr["amenity"="parking"]["name"](${bbox});out center;`;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = (await res.json()) as {
    elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
  };
  return data.elements
    .map((el) => ({
      name: el.tags?.name ?? '',
      lat: el.lat ?? el.center?.lat ?? NaN,
      lng: el.lon ?? el.center?.lon ?? NaN,
      capacity: Math.max(2, Number(el.tags?.capacity) || 10),
      addr: el.tags?.['addr:full'] ?? '',
    }))
    .filter((p) => p.name && Number.isFinite(p.lat));
}

async function main() {
  const stdIdx = process.argv.indexOf('--std');
  const stdPath = stdIdx > -1 ? process.argv[stdIdx + 1] : process.env.STD_PARKING_JSON;
  const std = stdPath && fs.existsSync(stdPath) ? loadStandardData(stdPath) : [];
  if (stdPath && std.length === 0) console.warn(`표준데이터 없음/비어있음: ${stdPath}`);

  const selected: ZoneSeed[] = [];
  const tooClose = (lat: number, lng: number) =>
    selected.some((z) => haversine(z.lat, z.lng, lat, lng) < DEDUPE_M);

  for (const [region, centers] of Object.entries(ZONE_CENTERS)) {
    for (const center of centers) {
      // 1순위: 표준데이터 (공영 우선 → 면수 큰 순)
      const stdNear = std
        .filter((p) => haversine(center.lat, center.lng, p.lat, p.lng) <= RADIUS_M)
        .sort((a, b) => Number(b.public_) - Number(a.public_) || b.capacity - a.capacity);

      let picked = 0;
      for (const p of stdNear) {
        if (picked >= PER_CENTER) break;
        if (tooClose(p.lat, p.lng)) continue;
        selected.push({
          name: p.name,
          region,
          address: p.addr || `${center.label} 인근`,
          lat: Math.round(p.lat * 1e6) / 1e6,
          lng: Math.round(p.lng * 1e6) / 1e6,
          capacity: Math.min(p.capacity, 30), // 데모 규모에 맞게 상한
          source: 'kr-standard-data',
        });
        picked++;
      }

      // 2순위: 부족분 OSM 보충
      if (picked < PER_CENTER) {
        try {
          const osm = (await fetchOsmParking(center))
            .filter((p) => haversine(center.lat, center.lng, p.lat, p.lng) <= RADIUS_M)
            .sort(
              (a, b) =>
                haversine(center.lat, center.lng, a.lat, a.lng) -
                haversine(center.lat, center.lng, b.lat, b.lng),
            );
          for (const p of osm) {
            if (picked >= PER_CENTER) break;
            if (tooClose(p.lat, p.lng)) continue;
            selected.push({
              name: p.name.includes('주차장') ? p.name : `${p.name} 주차장`,
              region,
              address: p.addr || `${center.label} 인근`,
              lat: Math.round(p.lat * 1e6) / 1e6,
              lng: Math.round(p.lng * 1e6) / 1e6,
              capacity: Math.min(p.capacity, 30),
              source: 'osm',
            });
            picked++;
          }
          await new Promise((r) => setTimeout(r, 1200)); // Overpass 부하 배려
        } catch (e) {
          console.warn(`  OSM 조회 실패(${center.label}):`, (e as Error).message);
        }
      }
      console.log(`[${region}] ${center.label}: ${picked}곳`);
    }
  }

  const outDir = path.resolve(__dirname, '../data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'zones.json');
  fs.writeFileSync(outFile, JSON.stringify(selected, null, 2));
  const bySource = selected.reduce<Record<string, number>>(
    (acc, z) => ({ ...acc, [z.source]: (acc[z.source] ?? 0) + 1 }),
    {},
  );
  console.log(`\n저장: ${outFile} — 총 ${selected.length}곳`, bySource);
}

void main();
