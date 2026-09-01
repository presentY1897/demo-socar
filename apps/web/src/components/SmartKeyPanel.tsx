'use client';

import { useState } from 'react';
import {
  applyControl,
  VEHICLE_CONTROL_META,
  type SmartKeyStateRes,
  type VehicleControlActionValue,
  type VehicleControlResultRes,
} from '@socar/shared';
import { api, ApiError } from '@/lib/api';

const ACTIONS: VehicleControlActionValue[] = [
  'UNLOCK',
  'LOCK',
  'IGNITION_ON',
  'IGNITION_OFF',
  'HAZARD',
  'HORN',
];

/**
 * 리모컨형 가상 스마트키.
 *
 * 조작 가능 여부는 shared의 `applyControl`로 판단한다 — 서버와 같은 함수라
 * "버튼은 눌리는데 서버가 거절"하는 어긋남이 생기지 않는다. 불가능한 조작은
 * 아예 비활성화하고 사유를 붙여 두고, 실제 실패(네트워크·경합)만 롤백으로 처리한다.
 */
export function SmartKeyPanel({
  rentalId,
  state,
}: {
  rentalId: string;
  state: SmartKeyStateRes;
}) {
  // 조작 후에는 서버 응답이 최신이라 패널이 상태를 이어서 들고 간다
  // (이 화면에서 차량 상태를 바꾸는 주체가 이 패널뿐이다)
  const [override, setOverride] = useState<SmartKeyStateRes | null>(null);
  const [pending, setPending] = useState<VehicleControlActionValue | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = override ?? state;

  async function press(action: VehicleControlActionValue) {
    const outcome = applyControl(view, action);
    if (!outcome.ok) {
      setError(outcome.reason);
      return;
    }

    const rollback = view;
    setOverride({ ...view, ...outcome.state, lastAction: action });
    setPending(action);
    setError(null);
    setToast(null);
    try {
      const result = await api<VehicleControlResultRes>(`/rentals/${rentalId}/control`, {
        method: 'POST',
        body: { action },
      });
      setOverride(result.state);
      setToast(VEHICLE_CONTROL_META[action].done);
    } catch (e) {
      setOverride(rollback);
      setError(e instanceof ApiError ? e.message : '차량과 통신하지 못했어요');
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="flex gap-2 text-xs">
        <span
          data-testid="door-state"
          className={`rounded-full px-2.5 py-1 font-semibold ${
            view.doorLocked ? 'bg-gray-100 text-gray-600' : 'bg-sky-100 text-sky-700'
          }`}
        >
          {view.doorLocked ? '🔒 잠김' : '🔓 열림'}
        </span>
        <span
          data-testid="engine-state"
          className={`rounded-full px-2.5 py-1 font-semibold ${
            view.engineOn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {view.engineOn ? '시동 ON' : '시동 OFF'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {ACTIONS.map((action) => {
          const meta = VEHICLE_CONTROL_META[action];
          const outcome = applyControl(view, action);
          const blocked = !outcome.ok;
          return (
            <button
              key={action}
              type="button"
              disabled={blocked || pending !== null}
              title={blocked ? outcome.reason : undefined}
              onClick={() => press(action)}
              className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white py-3 text-xs font-medium text-gray-700 disabled:opacity-40"
            >
              <span className="text-lg leading-none">{meta.icon}</span>
              {pending === action ? '전송 중' : meta.label}
            </button>
          );
        })}
      </div>

      {toast && (
        <p role="status" className="mt-2 text-xs text-sky-600">
          {toast}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
