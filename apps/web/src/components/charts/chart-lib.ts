import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

/**
 * Chart.js 실체를 감싸는 **유일한 지점** (M4-1).
 *
 * `chart.js/auto`(전 컨트롤러 자동 등록) 대신 쓰는 것만 등록한다 — 자동 등록은 도넛·레이더·
 * 극좌표까지 번들에 끌고 들어오는데 이 앱이 그리는 것은 막대와 선 둘뿐이다.
 *
 * 화면이 'chart.js'를 직접 import하지 않고 이 모듈만 보게 하는 이유는 테스트다:
 * jsdom에는 캔버스 2D 컨텍스트가 없어 실제 Chart는 마운트되지 않는다. 대역을 세울 지점이
 * 여기 하나면 테스트가 `vi.mock('@/components/charts/chart-lib')` 한 줄로 끝난다.
 */
Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
);

export { Chart };
