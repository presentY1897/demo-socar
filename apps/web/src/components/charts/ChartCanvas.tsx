'use client';

import { useEffect, useMemo, useRef } from 'react';
import { buildChartConfig, isEmptySpec, type ChartSpec } from '@/lib/chart-config';
import { Chart } from './chart-lib';

export interface ChartCanvasProps extends ChartSpec {
  /** 응답을 기다리는 중 — 빈 데이터("없음")와 구분해서 보여준다 */
  loading?: boolean;
  /** 컨테이너 높이(px). 차트는 부모 높이를 채운다 */
  height?: number;
  /** 데이터가 0건일 때의 문구 — 화면마다 사정이 달라 바꿔 낄 수 있게 둔다 */
  emptyText?: string;
  /** 스크린리더용 설명 (캔버스는 그림이라 내용을 읽어 줄 수 없다) */
  ariaLabel?: string;
}

/**
 * 프로젝트 공용 차트 (M4-1) — Chart.js 캔버스의 생명주기만 담당한다.
 *
 * "무엇을 어떻게 그리는가"는 순수 함수(`lib/chart-config.ts`)가 정하고 여기서는
 * 생성·파기와 **로딩/빈 데이터 상태**만 본다. 데이터가 없을 때 빈 캔버스를 남기면
 * 화면이 고장 난 것처럼 보이므로 캔버스 자체를 걸지 않고 문구를 세운다.
 *
 * 데이터가 바뀌면 차트를 새로 만든다(in-place update 대신). 이 앱의 차트는 필터를 바꿀 때마다
 * 축·계열까지 통째로 갈리는 리포트라, 갱신 경로를 하나로 두는 편이 어긋날 여지가 없다.
 */
export function ChartCanvas({
  loading,
  height = 192,
  emptyText = '데이터가 없어요',
  ariaLabel,
  ...spec
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const empty = isEmptySpec(spec);

  // spec은 매 렌더 새 객체(부모가 map으로 만든다)라 참조가 아니라 값으로 비교한다
  const specKey = JSON.stringify(spec);
  const config = useMemo(() => buildChartConfig(spec), [specKey]);

  useEffect(() => {
    // 로딩/빈 상태에는 캔버스가 없다 — ref가 비면 그릴 것도 없다
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, config);
    return () => chart.destroy();
  }, [config]);

  if (loading) {
    return <ChartPlaceholder height={height}>불러오는 중...</ChartPlaceholder>;
  }
  if (empty) {
    return <ChartPlaceholder height={height}>{emptyText}</ChartPlaceholder>;
  }

  return (
    <div style={{ height }} className="relative">
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel ?? spec.series[0]?.label} />
    </div>
  );
}

function ChartPlaceholder({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div
      style={{ height }}
      className="flex items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400"
    >
      {children}
    </div>
  );
}
