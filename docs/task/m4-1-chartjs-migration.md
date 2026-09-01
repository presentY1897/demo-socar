# M4-1 — Chart.js 전면 전환

- 마일스톤: M4 (지표·차트·Export) · 규모 M
- 상태: ☑ 완료 (2026-09-01)
- 의존: M3 완료

## 목적

**Chart.js 전면 통일로 확정**(Q6, 2026-09-01) — 기존 Recharts 차트를 포함해 전 차트를 Chart.js로 교체하고 라이브러리를 하나로 정리한다.

## 작업 내용

- [x] `chart.js` 의존성 추가 — **react-chartjs-2 없이 직접 canvas 래핑**. 래퍼가 얇아(설정은 순수 함수) 어댑터 한 겹이 주는 이득이 없고, 필요한 컨트롤러만 등록해(`chart.js/auto` 아님) 번들을 막대·선으로 좁혔다
- [x] 공용 차트 래퍼 컴포넌트: 프로젝트 컬러 토큰 적용 · 반응형 리사이즈 · 로딩/빈 데이터 상태 · 한국어 축/툴팁 포맷(원화, 날짜)
- [x] 기존 회계 탭의 일별 차트(Recharts)를 래퍼로 교체
- [x] `recharts` 의존성 제거 (`package.json` + import 전수 확인 + 락파일)
- [x] M3 화면 중 차트가 어울리는 자리에 적용 — ③ 작업/배차의 **핸들러별 오늘 처리량**(가로 누적 막대)

## 산출물

- `apps/web/src/components/charts/` — `chart-lib.ts`(Chart.js 등록·재수출, 대역 지점) · `ChartCanvas.tsx`(래퍼)
- `apps/web/src/lib/chart-config.ts` — 색 팔레트 · 한국어 단위 표기 · Chart.js 설정 빌더 (순수 함수)
- `apps/web/src/test/chart.ts` — Chart.js 대역 (`chartLibMock()` · `chartInstances()`)
- 회계 탭 일별 차트 교체 · 배차 탭 처리량 차트 추가 · `package.json`/락파일에서 recharts 제거

### 래퍼 공개 API

```tsx
<ChartCanvas
  kind="bar" | "line"
  labels={string[]}                 // 사람이 읽는 라벨 (변환은 화면에서 끝낸다)
  series={[{ label, data, color? }]}
  unit="krw" | "count" | "pct" | "hours"   // 축·툴팁 표기가 여기서 갈린다
  horizontal stacked                 // 범주 이름이 길 때 눕히고, 합이 의미 있으면 쌓는다
  loading height emptyText ariaLabel
/>
```

| 적용 위치 | 종류 |
|---|---|
| 회계 탭 — 일별 예약 건수 | 막대(건) |
| 회계 탭 — 일별 매출 | 선(원, 만/억 축약) |
| 작업/배차 탭 — 핸들러별 오늘 처리량 | 가로 누적 막대(건) |

## 완료 기준

- [x] `grep -r recharts apps/web` 결과 0건(소스·package.json·pnpm-lock), 빌드 통과
- [x] `/dashboard` 번들 118 kB → 80.5 kB (First Load 257 kB → 219 kB)
- [x] 전 차트가 동일 데이터로 렌더 — 매출 축은 "(만원)" 제목 대신 축 눈금이 만/억으로 접힌다

## 테스트

- **백엔드**: 해당 없음
- **프론트**: 30건 추가 (172 → 202)
  - `lib/__tests__/chart-config.test.ts` (17) — 원화/건/%/시간 표기, 축 축약(만·억), 날짜 라벨, 팔레트, 빈 데이터 판정, 설정 빌더(범례·축 콜백·툴팁·가로 누적)
  - `components/charts/__tests__/ChartCanvas.test.tsx` (8) — 데이터/로딩/빈 데이터 3상태 · 데이터 변경 시 재생성 · 동일 데이터면 유지 · 언마운트 파기
  - `components/ops/__tests__/AccountingCharts.test.tsx` (5) — 교체된 회계 차트가 MSW 지표 픽스처로 렌더
  - `dashboard/__tests__/ops-dispatch-accounting.test.tsx` — `AccountingCharts` 대역을 걷어내고 `chart-lib` 대역으로 교체(실제 래퍼가 도는 경로), 처리량 차트 1건 추가

## 참고

- [project-review.md](../project-review.md) §5.5
