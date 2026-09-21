# 실데이터 파이프라인 (전국 지원)

존과 도로망은 손으로 찍은 좌표가 아니라 실데이터에서 만든다. 거점 좌표(`apps/api/scripts/regions.ts`)에
도시를 추가하면 두 파이프라인이 함께 커버한다. 설계 근거는 [ADR-004](adr/004-road-graph-pipeline.md).

```bash
pnpm --filter @socar/api build:graph   # 도로망: OSM 보행 도로 → A* 그래프 (data/graphs/*.json.gz)
pnpm --filter @socar/api build:zones -- --std /path/to/전국주차장정보표준데이터.json
                                       # 존: 실제 주차장 → data/zones.json (시드가 읽음)
```

존 데이터는 **[전국주차장정보표준데이터](https://www.data.go.kr/data/15012896/standard.do)**(공공데이터포털)를
우선 사용하고, 커버리지가 부족한 지역은 OSM `amenity=parking`으로 보충한다.
현재 시드는 실제 주차장 30곳 (표준데이터 27 + OSM 3) — 이름·주소·면수가 실데이터다.

> 데이터 출처: 전국주차장정보표준데이터(공공누리 제1유형) · © OpenStreetMap contributors (ODbL)
