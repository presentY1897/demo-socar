import { act } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * EventSource 대역 — jsdom에는 SSE 구현이 없다.
 *
 * 실시간 화면의 관심사는 "서버가 보낸 틱이 화면에 반영되는가"이므로 전송 계층만 대역으로
 * 세우고, 페이로드 파싱·상태 갱신은 실제 훅(useLiveFleet)이 그대로 돈다.
 */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onmessage: ((e: { data: string }) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  /** 서버가 한 틱 보낸 것처럼 만든다 */
  emit(payload: unknown) {
    act(() => {
      this.onmessage?.({ data: JSON.stringify(payload) });
    });
  }
}

/** 테스트 시작에 호출 — vitest의 unstubGlobals가 뒤처리한다 */
export function stubEventSource(): typeof FakeEventSource {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  return FakeEventSource;
}

/** 가장 최근에 열린 연결 */
export const lastEventSource = (): FakeEventSource =>
  FakeEventSource.instances[FakeEventSource.instances.length - 1];
