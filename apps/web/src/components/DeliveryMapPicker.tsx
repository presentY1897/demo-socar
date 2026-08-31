'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="font-size:26px;line-height:1;transform:translateY(-4px)">📍</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 24],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

/** 부름 배달 위치 선택 — 지도를 탭해서 핀을 놓는다 */
export default function DeliveryMapPicker({
  center,
  position,
  onPick,
}: {
  center: [number, number];
  position: [number, number] | null;
  onPick: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer center={center} zoom={15} className="h-48 w-full rounded-lg" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      {position && <Marker position={position} icon={pinIcon} />}
    </MapContainer>
  );
}
