# M1-1 — 이용 플로우 도메인 마이그레이션

- 마일스톤: M1 (이용 플로우 완성) · 규모 M
- 상태: ☐ 대기
- 의존: 없음 (M1의 첫 작업 — M1의 스키마 변경을 이 작업 하나로 모은다)

## 목적

M1 전체(체크인/아웃·스마트키·문의·사고·매뉴얼)가 쓸 DB 모델을 한 번의 마이그레이션으로 준비한다.

## 작업 내용

- [ ] `prisma/schema.prisma`에 모델 추가:
  - `ConditionReport` — rentalId(FK) · phase(`CHECK_IN`/`CHECK_OUT` enum) · notes · parkingNote(반납 위치 층/구역, CHECK_OUT용) · createdAt + `ConditionPhoto`(reportId · mime · data(base64 text) · bytes)
  - `VehicleControlLog` — rentalId · vehicleId · action(`UNLOCK`/`LOCK`/`HAZARD`/`HORN`/`IGNITION_ON`/`IGNITION_OFF` enum) · at
  - `Inquiry` — userId · vehicleId? · rentalId? · category enum · body · status(`OPEN`/`ANSWERED`) · answer? · answeredAt?
  - `IncidentReport` — rentalId · description · status(`RECEIVED`/`PROCESSING`/`CLOSED`) · createdAt (+사진은 ConditionPhoto 패턴 재사용 또는 전용 테이블)
  - `Vehicle`에 임시 필드 `doorLocked Boolean @default(true)` · `engineOn Boolean @default(false)` — M3-1에서 `VehicleTelemetry`로 통합 예정임을 주석으로 명시
- [ ] 차종(modelName)별 매뉴얼 모의 콘텐츠를 시드 데이터로 추가 (DB 테이블 대신 API 내 정적 데이터로 시작해도 됨 — M1-6에서 결정)
- [ ] `prisma migrate dev` → 마이그레이션 1건 생성, `run-seed.ts` `SEED_VERSION +1`

## 산출물

- `apps/api/prisma/schema.prisma` · `apps/api/prisma/migrations/…` 1건 · `apps/api/prisma/(seed 파일)` 갱신

## 완료 기준

- 로컬 `db:deploy` + `db:seed` 통과, 기존 통합 테스트 14건 회귀 없음

## 테스트

- **백엔드**: 마이그레이션 후 기존 통합 테스트 전건 회귀 + 신규 모델 CRUD 스모크 1건(ConditionReport 저장/조회)
- **프론트**: 해당 없음

## 참고

- [project-review.md](../project-review.md) §5.2 신규 도메인 표 · 사진 저장 기본값(Q2): 압축 base64 DB 저장
