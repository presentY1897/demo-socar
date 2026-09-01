import type { ChartConfiguration } from 'chart.js';

/**
 * Chart.js 대역 (M4-1) — jsdom에는 캔버스 2D 컨텍스트가 없어 실제 Chart는 마운트되지 않는다.
 *
 * 전송 계층만 대역을 세우는 `sse.ts`와 같은 방식이다: **설정을 만드는 코드**
 * (`lib/chart-config.ts`)와 **캔버스를 붙이는 코드**(`ChartCanvas`)는 실제로 돌고,
 * 픽셀을 칠하는 부분만 가짜로 바꾼다. 그래서 "축 눈금을 원화로 찍는가" 같은 것을
 * 스냅샷 이미지가 아니라 설정 객체로 검증할 수 있다.
 *
 * ```tsx
 * vi.mock('@/components/charts/chart-lib', async () => (await import('@/test/chart')).chartLibMock());
 * // ...렌더 후
 * expect(lastChart().config.data.labels).toEqual(['1/1', '1/2']);
 * ```
 */

export interface FakeChart {
  canvas: HTMLCanvasElement;
  config: ChartConfiguration;
  destroyed: boolean;
}

const instances: FakeChart[] = [];

/** 만들어진 순서대로 전부 (파기된 것 포함) */
export const chartInstances = (): FakeChart[] => instances;
/** 아직 살아 있는 차트 — 파기 누락을 잡는다 */
export const liveCharts = (): FakeChart[] => instances.filter((c) => !c.destroyed);
export const lastChart = (): FakeChart => instances[instances.length - 1];
/** setup.ts가 테스트마다 비운다 */
export const resetCharts = (): void => {
  instances.length = 0;
};

export function chartLibMock() {
  class Chart {
    canvas: HTMLCanvasElement;
    config: ChartConfiguration;
    destroyed = false;

    constructor(canvas: HTMLCanvasElement, config: ChartConfiguration) {
      this.canvas = canvas;
      this.config = config;
      instances.push(this);
    }

    destroy() {
      this.destroyed = true;
    }

    update() {}
  }

  return { Chart };
}
