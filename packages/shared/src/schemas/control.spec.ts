import { describe, expect, it } from 'vitest';
import { applyControl, type SmartKeyState } from './control';

const locked: SmartKeyState = { doorLocked: true, engineOn: false };
const unlocked: SmartKeyState = { doorLocked: false, engineOn: false };
const running: SmartKeyState = { doorLocked: false, engineOn: true };

describe('스마트키 조작 규칙', () => {
  it('문 열기 → 잠금 → 시동의 정상 순서를 통과시킨다', () => {
    const opened = applyControl(locked, 'UNLOCK');
    expect(opened).toEqual({ ok: true, state: unlocked });

    const started = applyControl(unlocked, 'IGNITION_ON');
    expect(started).toEqual({ ok: true, state: running });

    const stopped = applyControl(running, 'IGNITION_OFF');
    expect(stopped).toEqual({ ok: true, state: unlocked });
  });

  it('시동이 켜져 있으면 문을 잠글 수 없다', () => {
    expect(applyControl(running, 'LOCK')).toEqual({
      ok: false,
      reason: '시동이 켜져 있어 문을 잠글 수 없어요. 시동을 먼저 꺼주세요',
    });
  });

  it('문이 잠긴 상태에서는 시동을 걸 수 없다', () => {
    expect(applyControl(locked, 'IGNITION_ON')).toEqual({
      ok: false,
      reason: '문이 잠겨 있어요. 문을 먼저 열어 주세요',
    });
  });

  it('비상등·경적은 신호일 뿐이라 상태를 바꾸지 않는다', () => {
    for (const action of ['HAZARD', 'HORN'] as const) {
      expect(applyControl(running, action)).toEqual({ ok: true, state: running });
    }
  });

  it('같은 방향 재조작은 실물 리모컨처럼 그냥 통과한다', () => {
    expect(applyControl(unlocked, 'UNLOCK')).toEqual({ ok: true, state: unlocked });
    expect(applyControl(locked, 'LOCK')).toEqual({ ok: true, state: locked });
    expect(applyControl(unlocked, 'IGNITION_OFF')).toEqual({ ok: true, state: unlocked });
  });
});
