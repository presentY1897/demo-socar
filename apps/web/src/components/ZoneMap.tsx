'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { useEffect } from 'react';

export interface ZoneMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicleCount: number;
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

function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, Math.max(map.getZoom(), 14), { duration: 0.5 });
  }, [center, map]);
  return null;
}

export default function ZoneMap({
  zones,
  selectedId,
  onSelect,
}: {
  zones: ZoneMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = zones.find((z) => z.id === selectedId);
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
      <FlyTo center={selected ? [selected.lat, selected.lng] : null} />
      {zones.map((z) => (
        <Marker
          key={z.id}
          position={[z.lat, z.lng]}
          icon={zoneIcon(z.vehicleCount, z.id === selectedId)}
          eventHandlers={{ click: () => onSelect(z.id) }}
        />
      ))}
    </MapContainer>
  );
}
