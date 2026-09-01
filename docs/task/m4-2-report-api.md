# M4-2 — 리포트 빌더 API

- 마일스톤: M4 (지표·차트·Export) · 규모 M
- 상태: ☐ 대기
- 의존: M3-3

## 목적

피드백 #5 "지표는 어떻게 뽑을지" — 지표를 조합·필터해서 뽑는 단일 리포트 API. M4-3 UI와 M4-4 Export가 이 위에 올라간다.

## 작업 내용

- [ ] `GET /ops/reports` 파라미터:
  - `metric`: `revenue`(매출) / `utilization`(가동률) / `zoneOccupancy`(존 점유율) / `taskThroughput`(작업 처리량) / `lateReturnRate`(지연반납률)
  - `from` / `to`(기간) · `groupBy`: `day` / `zone` / `model` (metric별 허용 조합 검증, 미허용 조합 400)
  - 필터: `zoneId?` · `model?`
- [ ] 응답 형태 통일: `{ meta: {metric, groupBy, range}, rows: [{key, label, value}...] }` — 차트/표/Export가 같은 응답 사용
- [ ] 구현은 SQL 집계(기존 metrics 집계 쿼리 확장), N+1 없이

## 산출물

- ops reports controller/service · shared에 리포트 쿼리/응답 스키마

## 완료 기준

- 통합 테스트: metric×groupBy 유효 조합별 응답 형태 · 미허용 조합 400 · 기간 필터 반영 검증

## 테스트

- **백엔드(통합)**: metric×groupBy 유효 조합별 응답 형태 · 미허용 조합 400 · 기간/존/차종 필터 반영 · 비 OPS 403
- **프론트**: 해당 없음 (화면은 M4-3)

## 참고

- [project-review.md](../project-review.md) §5.5
