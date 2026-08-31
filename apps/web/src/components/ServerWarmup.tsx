'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { API_URL } from '@/lib/api';

/**
 * Render 무료 티어 콜드 스타트 게이트.
 * 접속 직후 /health를 짧게 확인해서 서버가 깨어 있으면 아무것도 렌더링하지 않고,
 * 잠들어 있으면(첫 요청이 서버를 깨우는 트리거가 된다) 진행 상황 오버레이를 띄운다.
 * 서버가 깨어나면 SWR 캐시 전체를 재검증해 화면이 자동으로 채워진다.
 */

const FAST_TIMEOUT_MS = 2500; // 이 안에 응답하면 이미 깨어 있는 것
const POLL_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 120000;
const EXPECTED_SEC = 60; // 진행 바 기준 (안내 문구와 일치)

async function pingHealth(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/health`, { signal: ctrl.signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function ServerWarmup() {
  const [state, setState] = useState<'checking' | 'waking' | 'ready' | 'failed'>('checking');
  const [elapsedSec, setElapsedSec] = useState(0);
  const { mutate } = useSWRConfig();
  const running = useRef(false);

  const warmUp = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState('checking');
    setElapsedSec(0);

    if (await pingHealth(FAST_TIMEOUT_MS)) {
      setState('ready');
      running.current = false;
      return;
    }

    setState('waking');
    const startedAt = Date.now();
    const ticker = setInterval(
      () => setElapsedSec(Math.round((Date.now() - startedAt) / 1000)),
      1000,
    );

    try {
      while (Date.now() - startedAt < MAX_WAIT_MS) {
        if (await pingHealth(POLL_TIMEOUT_MS)) {
          setState('ready');
          await mutate(() => true); // 대기 중 실패했던 요청 전부 재검증
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      setState('failed');
    } finally {
      clearInterval(ticker);
      running.current = false;
    }
  }, [mutate]);

  useEffect(() => {
    void warmUp();
  }, [warmUp]);

  if (state === 'ready' || state === 'checking') return null;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-white px-8">
      <p className="text-2xl font-extrabold tracking-tight text-sky-500">MOCAR</p>

      {state === 'waking' ? (
        <>
          <div className="mt-6 h-8 w-8 animate-spin rounded-full border-[3px] border-sky-100 border-t-sky-500" />
          <p className="mt-5 font-semibold">데모 서버를 깨우는 중이에요</p>
          <p className="mt-1 text-center text-sm text-gray-500">
            무료 서버는 사용이 없으면 잠들어요.
            <br />
            보통 1분 안에 깨어납니다 · {elapsedSec}초 경과
          </p>
          <div className="mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-sky-500 transition-all duration-1000"
              style={{ width: `${Math.min((elapsedSec / EXPECTED_SEC) * 100, 96)}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <p className="mt-6 font-semibold">서버 응답이 없어요</p>
          <p className="mt-1 text-center text-sm text-gray-500">
            잠시 후 다시 시도해 주세요
          </p>
          <button
            onClick={() => void warmUp()}
            className="mt-4 rounded-lg bg-sky-500 px-6 py-2 text-sm font-semibold text-white"
          >
            다시 시도
          </button>
        </>
      )}
    </div>
  );
}
