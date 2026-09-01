'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import type { TaskPlaceRes } from '@socar/shared';

/**
 * 작업의 출발 → 도착을 한 화면에 보여주는 작은 지도.
 *
 * 홈의 `ZoneMap`은 존 탐색용(클러스터링·차량 수 배지·선택 시 flyTo)이라 두 지점을 잇는
 * 이 용도와 맞지 않는다. 대신 부름 위치 선택(`DeliveryMapPicker`)과 같은 경량 지도 구성을
 * 따르고, 실제 경로 대신 직선으로 잇는다 — 예상 이동 시간(A*)은 서버가 이미 계산해 준다.
 */

const placeIcon = (emoji: string, ring: string) =>
  L.divIcon({
    className: '',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:30px;height:30px;border-radius:50%;
      background:#fff;border:2.5px solid ${ring};font-size:15px;
      box-shadow:0 1px 5px rgba(0,0,0,.3);">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

export default function TaskRouteMap({ from, to }: { from: TaskPlaceRes; to: TaskPlaceRes }) {
  const points: [number, number][] = [
    [from.lat, from.lng],
    [to.lat, to.lng],
  ];

  return (
    <MapContainer
      bounds={L.latLngBounds(points).pad(0.4)}
      className="h-44 w-full rounded-lg"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={points} pathOptions={{ color: '#0ea5e9', weight: 4, dashArray: '7 7' }} />
      <Marker position={points[0]} icon={placeIcon('🚩', '#64748b')} />
      <Marker position={points[1]} icon={placeIcon('🏁', '#0ea5e9')} />
    </MapContainer>
  );
}
