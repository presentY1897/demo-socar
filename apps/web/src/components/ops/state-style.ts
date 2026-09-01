import { OPS_VEHICLE_STATE_META, type OpsVehicleState } from '@socar/shared';

/**
 * 운영 센터의 색 규칙 — 상태 라벨과 색의 근거는 shared의 `tone` 한 곳이다.
 *
 * 상태마다 색을 다시 적으면 표의 배지와 지도의 마커가 서로 다른 색으로 갈린다.
 * 여기서는 tone(gray/green/amber/red)만 화면 표현으로 옮긴다.
 */
const TONE_BADGE: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-500',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-50 text-red-500',
};

/** 지도 마커는 CSS 클래스가 아니라 색값이 필요하다 (leaflet divIcon) */
const TONE_HEX: Record<string, string> = {
  gray: '#9ca3af',
  green: '#16a34a',
  amber: '#f59e0b',
  red: '#ef4444',
};

export const stateBadgeClass = (state: OpsVehicleState): string =>
  TONE_BADGE[OPS_VEHICLE_STATE_META[state].tone] ?? TONE_BADGE.gray;

export const stateColor = (state: OpsVehicleState): string =>
  TONE_HEX[OPS_VEHICLE_STATE_META[state].tone] ?? TONE_HEX.gray;

/** 경고 심각도 — danger는 "지금 움직여야 하는 것" */
export const SEVERITY_STYLE: Record<string, string> = {
  danger: 'border-red-200 bg-red-50 text-red-600',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
};
