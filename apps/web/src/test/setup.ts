import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { resetCharts } from './chart';
import { server } from './msw/server';

// MSW 목 서버 — 테스트가 실제 API를 때리는 일이 없도록 요청을 전부 가로챈다.
// 핸들러에 없는 요청은 error로 실패시켜 "목을 빠뜨린 테스트"를 조용히 통과시키지 않는다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
  resetCharts(); // 차트 대역이 기록한 인스턴스 — 테스트 간에 새면 "몇 개 그렸나"가 어긋난다
});
afterAll(() => server.close());

// jsdom에 없는 브라우저 API 보충
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
