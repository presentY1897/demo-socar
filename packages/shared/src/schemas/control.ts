import { z } from 'zod';

/**
 * 가상 스마트키 — 문/시동/비상등/경적.
 *
 * 실물 쏘카 스마트키에는 시동이 없지만 데모 효과를 위해 포함하기로 확정했다
 * (work-plan Q3, 2026-09-01). 판단 근거는 ADR-007(M1-8)에 남긴다.
 */

export const vehicleControlActionSchema = z.enum([
  'UNLOCK',
  'LOCK',
  'HAZARD',
  'HORN',
  'IGNITION_ON',
  'IGNITION_OFF',
]);
export type VehicleControlActionValue = z.infer<typeof vehicleControlActionSchema>;

export const vehicleControlSchema = z.object({ action: vehicleControlActionSchema });
export type VehicleControlDto = z.infer<typeof vehicleControlSchema>;

/** 버튼 라벨과 성공 안내 — 화면과 테스트가 같은 문구를 본다 */
export const VEHICLE_CONTROL_META: Record<
  VehicleControlActionValue,
  { label: string; icon: string; done: string }
> = {
  UNLOCK: { label: '문 열기', icon: '🔓', done: '문을 열었어요' },
  LOCK: { label: '문 잠금', icon: '🔒', done: '문을 잠갔어요' },
  HAZARD: { label: '비상등', icon: '🚨', done: '비상등을 켰어요' },
  HORN: { label: '경적', icon: '📣', done: '경적을 울렸어요' },
  IGNITION_ON: { label: '시동 켜기', icon: '🔑', done: '시동을 걸었어요' },
  IGNITION_OFF: { label: '시동 끄기', icon: '⏹️', done: '시동을 껐어요' },
};

/** 차량의 조작 가능 상태 (M3-1에서 VehicleTelemetry로 통합 예정) */
export interface SmartKeyState {
  doorLocked: boolean;
  engineOn: boolean;
}

export type ControlOutcome =
  | { ok: true; state: SmartKeyState }
  | { ok: false; reason: string };

/**
 * 조작의 정합성 규칙과 결과 상태. 서버 검증과 화면의 낙관적 갱신이 같은 함수를 쓴다 —
 * 규칙이 두 벌이면 버튼은 눌리는데 서버가 거절하는(또는 그 반대) 어긋남이 생긴다.
 *
 * 비상등·경적은 신호일 뿐이라 상태를 바꾸지 않는다.
 * 같은 방향 재조작(이미 열린 문을 다시 열기)은 실물 리모컨처럼 그냥 통과시킨다.
 */
export function applyControl(
  state: SmartKeyState,
  action: VehicleControlActionValue,
): ControlOutcome {
  switch (action) {
    case 'UNLOCK':
      return { ok: true, state: { ...state, doorLocked: false } };
    case 'LOCK':
      // 시동이 걸린 채로 잠그면 차 안에 키를 두고 잠그는 상황이 된다
      return state.engineOn
        ? { ok: false, reason: '시동이 켜져 있어 문을 잠글 수 없어요. 시동을 먼저 꺼주세요' }
        : { ok: true, state: { ...state, doorLocked: true } };
    case 'IGNITION_ON':
      return state.doorLocked
        ? { ok: false, reason: '문이 잠겨 있어요. 문을 먼저 열어 주세요' }
        : { ok: true, state: { ...state, engineOn: true } };
    case 'IGNITION_OFF':
      return { ok: true, state: { ...state, engineOn: false } };
    case 'HAZARD':
    case 'HORN':
      return { ok: true, state };
  }
}
