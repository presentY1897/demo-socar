import { z } from 'zod';

/**
 * 차량 텔레메트리 공용 값 (M3-1·M3-2).
 *
 * 운영 화면이 보는 "차가 지금 뭘 하고 있나"는 `VehicleStatus`(예약 가능 여부)와 다른 축이다:
 * 정비 중이 아니어도 운행 중일 수 있고, 탁송 중이면 존에 없다. 그래서 별도 상태로 둔다.
 * 라벨을 여기 함께 두는 이유는 API 응답·백오피스 화면·테스트가 같은 문구를 보게 하기 위해서다.
 */
export const opsVehicleStateSchema = z.enum(['IDLE', 'IN_USE', 'IN_TRANSIT', 'MAINTENANCE']);
export type OpsVehicleState = z.infer<typeof opsVehicleStateSchema>;

export const OPS_VEHICLE_STATE_META: Record<OpsVehicleState, { label: string; tone: string }> = {
  IDLE: { label: '대기', tone: 'gray' },
  IN_USE: { label: '운행', tone: 'green' },
  IN_TRANSIT: { label: '탁송', tone: 'amber' },
  MAINTENANCE: { label: '정비', tone: 'red' },
};

/** EV는 같은 fuelPct가 배터리 잔량을 뜻한다 — 화면 라벨만 갈린다 */
export const fuelGaugeLabel = (fuel: 'EV' | 'GASOLINE' | 'HYBRID'): string =>
  fuel === 'EV' ? '배터리' : '연료';
