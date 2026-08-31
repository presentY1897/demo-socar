/**
 * 서비스 거점 정의 — 도로망(build-graph)과 존 데이터(build-zones)가 공유한다.
 * 전국 어느 도시든 여기에 중심 좌표를 추가하면 두 파이프라인이 함께 커버한다.
 *
 * 주의: 존은 중심 반경 2km 안에서만 선별한다 — 도로망 그래프 bbox(±2.2km)가
 * 커버하는 범위 안에 있어야 A* 이동시간 계산이 폴백 없이 동작한다.
 */
export interface RegionCenter {
  label: string;
  lat: number;
  lng: number;
}

export const REGIONS: Record<string, RegionCenter[]> = {
  seoul: [
    { label: '성수역', lat: 37.544579, lng: 127.055961 },
    { label: '서울숲', lat: 37.544061, lng: 127.037627 },
    { label: '뚝섬역', lat: 37.547189, lng: 127.047478 },
    { label: '왕십리역', lat: 37.561257, lng: 127.037756 },
    { label: '데모컴퍼니 오피스', lat: 37.542312, lng: 127.054883 },
    { label: '강남역', lat: 37.497175, lng: 127.02758 },
    { label: '홍대입구역', lat: 37.557527, lng: 126.9244669 },
  ],
  busan: [
    { label: '서면역', lat: 35.157845, lng: 129.059334 },
    { label: '부산역', lat: 35.115225, lng: 129.041538 },
  ],
  daejeon: [{ label: '대전역', lat: 36.331785, lng: 127.434257 }],
  jeju: [{ label: '제주공항', lat: 33.507024, lng: 126.492769 }],
};

/** 존 선별용 거점 — 오피스(전용존은 시드가 따로 만든다)는 제외 */
export const ZONE_CENTERS: Record<string, RegionCenter[]> = Object.fromEntries(
  Object.entries(REGIONS).map(([region, centers]) => [
    region,
    centers.filter((c) => !c.label.includes('오피스')),
  ]),
);
