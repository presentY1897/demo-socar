'use client';

import { useEffect, useState } from 'react';
import type { LiveVehicleRes, LiveVehiclesEvent } from '@socar/shared';
import { API_URL, getToken } from './api';

export interface LiveFleet {
  ts: string;
  vehicles: LiveVehicleRes[];
}

/**
 * 실시간 차량 텔레메트리 구독 (M3-2 SSE, 5초 틱).
 *
 * EventSource는 헤더를 붙일 수 없어 토큰을 쿼리로 보낸다 — 서버가 그 계약으로 받는다.
 * 연결은 화면이 필요할 때만 연다(`enabled`): 운영 홈이 아닌 탭에서 5초마다 전 차량을
 * 계산시키면 데모 서버가 쓸데없이 바쁘다.
 */
export function useLiveFleet(enabled: boolean): LiveFleet | null {
  const [live, setLive] = useState<LiveFleet | null>(null);

  useEffect(() => {
    // jsdom·SSR에는 EventSource가 없다 — 실시간 없이도 화면 나머지는 그려져야 한다
    if (!enabled || typeof EventSource === 'undefined') return;

    const es = new EventSource(`${API_URL}/metrics/vehicles/live?token=${getToken()}`);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data) as LiveVehiclesEvent;
      setLive({ ts: payload.ts, vehicles: payload.vehicles });
    };
    return () => es.close();
  }, [enabled]);

  return live;
}
