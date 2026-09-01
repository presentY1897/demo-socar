# M4-2 — 리포트 빌더 API

- 마일스톤: M4 (지표·차트·Export) · 규모 M
- 상태: ☑ 완료 (2026-09-01)
- 의존: M3-3

## 목적

피드백 #5 "지표는 어떻게 뽑을지" — 지표를 조합·필터해서 뽑는 단일 리포트 API. M4-3 UI와 M4-4 Export가 이 위에 올라간다.

## 작업 내용

- [x] `GET /ops/reports` 파라미터:
  - `metric`: `revenue`(매출) / `utilization`(가동률) / `zoneOccupancy`(존 점유율) / `taskThroughput`(작업 처리량) / `lateReturnRate`(지연반납률)
  - `from` / `to`(기간, `YYYY-MM-DD` KST 달력 · 기본 최근 30일 · 최대 366일) · `groupBy`: `day` / `zone` / `model` (metric별 허용 조합 검증, 미허용 조합 400)
  - 필터: `zoneId?` · `model?` — **빈 문자열은 "지정 안 함"**(화면 셀렉트의 "전체"가 400이 되지 않게)
- [x] 응답 형태 통일: `{ meta: {metric, groupBy, unit, range, filters, total}, rows: [{key, label, value}...] }` — 차트/표/Export가 같은 응답 사용
- [x] 구현은 SQL 집계, N+1 없이 — 지표당 질의 1~2회(비율 지표의 분모 질의 포함), 그룹 수와 무관
- [x] `GET /ops/reports/options` — 필터 폼의 존·차종 선택지 (시드가 만든 값이라 화면이 적을 수 없다)

### 지표 × groupBy 허용 조합 (`REPORT_METRIC_META` 단일 소스)

| 지표 | 단위 | 일자 | 존 | 차종 | 기간 반응 | 세는 대상 |
|---|---|:--:|:--:|:--:|:--:|---|
| `revenue` 매출 | 원 | ✓ | ✓ | ✓ | ✓ | 기간 안 승인된(CAPTURED) 이용 결제 합 |
| `utilization` 가동률 | % | ✓ | ✓ | ✓ | ✓ | 예약 점유 시간 ÷ (차량 수 × 기간) |
| `zoneOccupancy` 존 점유율 | % | — | ✓ | — | **✗** | 지금 배정된 차량 ÷ 면수 (현재 스냅샷) |
| `taskThroughput` 작업 처리량 | 건 | ✓ | ✓ | — | ✓ | 기간 안 완료된 작업 (출발 존 기준) |
| `lateReturnRate` 지연 반납률 | % | ✓ | ✓ | ✓ | ✓ | 반납 건 중 지연(lateMinutes>0) 비율 |

### 결정

- **존 축은 차량의 현재 배정 존**이다. 예약 시점의 존 이력을 남기지 않으므로 차를 옮기면 과거 매출의 귀속 존도 함께 움직인다. 작업 처리량만 예외로 **출발 존**(작업이 실제로 시작된 곳)을 쓴다
- **일자 축은 KST 달력**. 결제 승인·반납·작업 완료 시각은 `timestamp`(tz 없음, UTC 벽시계)로 저장돼 있어 `AT TIME ZONE 'UTC'`로 선언한 뒤 KST로 옮긴다 — 바로 KST로 읽으면 자정 근처 값이 전날로 밀린다
- **비율 지표의 전체 값(`meta.total`)은 행 평균이 아니라 가중 평균**(분자 합 ÷ 분모 합)이다. 예약 2건짜리 존의 100%와 200건짜리 존의 10%를 평균 내면 뜻이 없다
- **일자 축은 빠진 날을 0으로 채운다**(존·차종 축은 값이 있는 그룹만, 큰 값 순). 없는 날을 건너뛰면 선 그래프가 그날도 팔린 것처럼 이어진다. 단 존 점유율은 차량이 없는 존도 0%로 남긴다 — 빈 존이 곧 보고 싶은 값이라서
- `zoneOccupancy`가 기간에 반응하지 않는 비대칭은 숨기지 않고 `REPORT_METRIC_META.periodSensitive`로 드러내 화면이 표기한다 (회계 탭의 월 고정비와 같은 종류)

## 산출물

- `apps/api/src/ops/reports/` — `reports.service.ts`(집계) · `reports.controller.ts` · `ops-reports.module.ts`
- `packages/shared/src/schemas/report.ts` — 지표 사전(`REPORT_METRIC_META`) · 축/단위 라벨 · 기간 프리셋 · 요청 DTO
- `packages/shared/src/schemas/api.ts` — `reportResponseSchema` · `reportOptionsSchema`

## 완료 기준

- [x] 통합 테스트: metric×groupBy 유효 조합별 응답 형태 · 미허용 조합 400 · 기간 필터 반영 검증

## 테스트

- **백엔드(통합)**: `test/ops-reports.int-spec.ts` 19건 (258 → 277)
  - 전용 존·차량 2대·예약 3건(자정을 넘는 건 포함)·결제(성공 2·실패 1)·이용 2건·완료 작업 1건을 심고 **그 존으로 좁혀** 손계산과 대조
  - 허용 조합 11개 전부 200 · 미허용 3조합 400 · 잘못된 파라미터 7종 400 · 기간/존/차종 필터 반영 · 비 OPS 403 · 비로그인 401
- **단위**: `packages/shared/src/schemas/report.spec.ts` 12건 (81 → 93) — 지표 사전 불변식, 요청 검증, 날짜 계산
- **프론트**: 해당 없음 (화면은 M4-3)

## 참고

- [project-review.md](../project-review.md) §5.5
