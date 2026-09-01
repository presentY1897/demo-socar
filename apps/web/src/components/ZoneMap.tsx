'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';

export interface ZoneMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicleCount: number;
}

/**
 * 존 위에 겹쳐 그리는 차량 마커 (M3-4 운영 홈의 실시간 지도).
 *
 * 존과 같은 지도를 쓰는 이유는 운영자가 보는 질문이 "어느 존 근처에 무엇이 떠 있나"라서다 —
 * 지도를 하나 더 만들면 타일·줌·좌표 규약이 두 벌로 갈린다. 색은 호출자가 정한다
 * (상태 → 색 매핑의 단일 소스는 components/ops/state-style.ts).
 */
export interface VehicleMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  color: string;
}

/** 이 줌 이상에서는 개별 존, 미만에서는 그리드 셀 단위로 취합 */
const CLUSTER_BELOW_ZOOM = 13;

interface Cluster {
  key: string;
  lat: number;
  lng: number;
  zones: ZoneMarker[];
  vehicleTotal: number;
}

/** 줌에 비례해 줄어드는 그리드 셀로 취합 (플러그인 없는 경량 클러스터링) */
function clusterZones(zones: ZoneMarker[], zoom: number): Cluster[] {
  const cellDeg = 360 / Math.pow(2, zoom + 2); // 줌 7 ≈ 0.7°, 줌 12 ≈ 0.022°
  const buckets = new Map<string, ZoneMarker[]>();
  for (const z of zones) {
    const key = `${Math.floor(z.lat / cellDeg)}:${Math.floor(z.lng / cellDeg)}`;
    const list = buckets.get(key);
    if (list) list.push(z);
    else buckets.set(key, [z]);
  }
  return [...buckets.entries()].map(([key, members]) => ({
    key,
    lat: members.reduce((s, z) => s + z.lat, 0) / members.length,
    lng: members.reduce((s, z) => s + z.lng, 0) / members.length,
    zones: members,
    vehicleTotal: members.reduce((s, z) => s + z.vehicleCount, 0),
  }));
}

function zoneIcon(count: number, active: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:34px;height:34px;border-radius:50%;
      background:${active ? '#0369a1' : '#0ea5e9'};color:#fff;
      font-size:13px;font-weight:700;border:2.5px solid #fff;
      box-shadow:0 1px 6px rgba(0,0,0,.35);">${count}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function clusterIcon(vehicleTotal: number, zoneCount: number) {
  return L.divIcon({
    className: '',
    html: `<div style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      width:46px;height:46px;border-radius:50%;
      background:#0284c7;color:#fff;border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.4);line-height:1.05;">
      <span style="font-size:14px;font-weight:800;">${vehicleTotal}</span>
      <span style="font-size:9px;opacity:.85;">${zoneCount}곳</span>
    </div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  });
}

function vehicleIcon(color: string, active: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${active ? 18 : 14}px;height:${active ? 18 : 14}px;border-radius:50%;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize: [active ? 18 : 14, active ? 18 : 14],
    iconAnchor: [active ? 9 : 7, active ? 9 : 7],
  });
}

function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, Math.max(map.getZoom(), 14), { duration: 0.5 });
  }, [center, map]);
  return null;
}

function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  return null;
}

function ClusterMarker({ cluster }: { cluster: Cluster }) {
  const map = useMap();
  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={clusterIcon(cluster.vehicleTotal, cluster.zones.length)}
      eventHandlers={{
        // 클릭하면 취합이 풀릴 때까지 확대
        click: () =>
          map.flyTo([cluster.lat, cluster.lng], Math.min(map.getZoom() + 2, CLUSTER_BELOW_ZOOM), {
            duration: 0.5,
          }),
      }}
    />
  );
}

export default function ZoneMap({
  zones,
  selectedId,
  onSelect,
  vehicles = [],
  selectedVehicleId = null,
  onSelectVehicle,
}: {
  zones: ZoneMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 실시간 차량 오버레이 — 없으면 기존 존 지도 그대로다 */
  vehicles?: VehicleMarker[];
  selectedVehicleId?: string | null;
  onSelectVehicle?: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(14);
  const selected = zones.find((z) => z.id === selectedId);
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  const clusters = useMemo(
    () => (zoom < CLUSTER_BELOW_ZOOM ? clusterZones(zones, zoom) : null),
    [zones, zoom],
  );

  return (
    <MapContainer
      center={[37.5446, 127.0559]}
      zoom={14}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomTracker onZoom={setZoom} />
      <FlyTo
        center={
          selectedVehicle
            ? [selectedVehicle.lat, selectedVehicle.lng]
            : selected
              ? [selected.lat, selected.lng]
              : null
        }
      />

      {clusters
        ? clusters.map((c) =>
            c.zones.length === 1 ? (
              <Marker
                key={c.zones[0].id}
                position={[c.zones[0].lat, c.zones[0].lng]}
                icon={zoneIcon(c.zones[0].vehicleCount, c.zones[0].id === selectedId)}
                eventHandlers={{ click: () => onSelect(c.zones[0].id) }}
              />
            ) : (
              <ClusterMarker key={c.key} cluster={c} />
            ),
          )
        : zones.map((z) => (
            <Marker
              key={z.id}
              position={[z.lat, z.lng]}
              icon={zoneIcon(z.vehicleCount, z.id === selectedId)}
              eventHandlers={{ click: () => onSelect(z.id) }}
            />
          ))}

      {/* 차량은 존 위에 얹는다 — 존은 배경, 지금 움직이는 것이 전경이다 */}
      {vehicles.map((v) => (
        <Marker
          key={v.id}
          position={[v.lat, v.lng]}
          title={v.label}
          icon={vehicleIcon(v.color, v.id === selectedVehicleId)}
          eventHandlers={onSelectVehicle ? { click: () => onSelectVehicle(v.id) } : undefined}
        />
      ))}
    </MapContainer>
  );
}
