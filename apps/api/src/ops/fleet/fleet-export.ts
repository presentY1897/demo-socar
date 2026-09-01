import {
  FUEL_LABEL,
  OPS_VEHICLE_STATE_META,
  VEHICLE_STATUS_LABEL,
  type OpsFleetVehicleRes,
} from '@socar/shared';
import type { ExportSpec } from '../../common/export/export';

/**
 * 차량 표 CSV의 열 (M4-4).
 *
 * `telemetry`·`insurance`·`nextReservation`은 중첩 객체다 — 자동으로 펴면 `telemetry.fuelPct`
 * 같은 헤더가 나오는데 그건 사람이 읽는 표가 아니다. **한 열씩 손으로 이름을 붙인다.**
 * 값이 없는 중첩(보험 정보가 없는 차, 다음 예약이 없는 차)은 빈 칸으로 남는다.
 *
 * 상태·연료·운행 가능 여부의 한국어 표기는 shared가 단일 소스다 — 화면의 배지와 파일의
 * 글자가 갈리면 같은 데이터로 읽히지 않는다.
 */
export const FLEET_EXPORT: ExportSpec<OpsFleetVehicleRes> = {
  name: '차량목록',
  columns: [
    { header: '차량 번호', value: (v) => v.plateNo },
    { header: '차종', value: (v) => v.modelName },
    { header: '연료', value: (v) => FUEL_LABEL[v.fuel] },
    { header: '좌석', value: (v) => v.seats },
    { header: '상태', value: (v) => OPS_VEHICLE_STATE_META[v.state].label },
    { header: '운행 가능', value: (v) => VEHICLE_STATUS_LABEL[v.status] },
    { header: '배정 존', value: (v) => v.zone.name },
    { header: '연료·배터리(%)', value: (v) => round1(v.telemetry.fuelPct) },
    { header: '연료 부족', value: (v) => (v.lowFuel ? 'Y' : '') },
    { header: '주행거리(km)', value: (v) => round1(v.telemetry.odometerKm) },
    { header: '문 잠금', value: (v) => (v.telemetry.doorLocked ? '잠김' : '열림') },
    { header: '시동', value: (v) => (v.telemetry.engineOn ? 'ON' : 'OFF') },
    { header: '위도', value: (v) => v.telemetry.lat },
    { header: '경도', value: (v) => v.telemetry.lng },
    { header: '다음 예약 시작', value: (v) => v.nextReservation?.startAt },
    { header: '다음 예약 종료', value: (v) => v.nextReservation?.endAt },
    { header: '다음 예약 이용자', value: (v) => v.nextReservation?.userName },
    { header: '보험사', value: (v) => v.insurance?.insurerName },
    { header: '보험 만기', value: (v) => v.insurance?.expiresAt },
    { header: '보험 D-day', value: (v) => v.insurance?.dDay },
  ],
};

const round1 = (n: number) => Math.round(n * 10) / 10;
