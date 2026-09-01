# M5-1 — 법인 등급 + 리스 도메인

- 마일스톤: M5 (MOCAR 비즈니스 — 법인 플릿/리스 관리 서비스) · 규모 M
- 상태: ☑ 완료
- 의존: 없음 (M1~M4와 독립 — 순서 조정 가능)

## 목적

3차 피드백: "법인 차량의 리스도 관리한다는 서비스 관점에서 접근해 분리 처리 가능하게 구성". 쏘카 내부 기능 가정 대신 **법인이 차량을 리스해 쓰고 자기 플릿을 관리하는 B2B 서비스(MOCAR 비즈니스)**로 프레이밍한다. 이 작업은 그 도메인 기반 — 등급 권한 + 리스 계약.

## 작업 내용

- [x] **shared** — 등급 enum + 권한 매핑 상수 (단일 소스, API 가드와 웹 분기가 함께 사용):
  - `VIEWER` — 현황 조회만
  - `REQUESTER` — 조회 + 배차 요청 생성 (기존 CORP_MEMBER 상당)
  - `APPROVER` — + 추천 검토·승인/반려 · 타임라인 보드
  - `MANAGER` — + 멤버 등급 관리 · **플릿/리스 관리** · 법인 설정 (기존 CORP_ADMIN 상당)
  - 권한 매핑: `CORP_PERMISSIONS[grade] = { viewBoard, createRequest, approve, manageMembers, manageFleet, ... }`
- [x] **DB** — User에 `corpGrade`(법인 소속만, nullable) 마이그레이션. 기존 매핑: CORP_MEMBER→REQUESTER, CORP_ADMIN→MANAGER
- [x] **DB** — `LeaseContract` 모델: corporationId · vehicleId(법인 전용 차량) · monthlyFeeKrw · startAt/endAt · status(`ACTIVE`/`EXTENSION_REQUESTED`/`TERMINATION_REQUESTED`/`ENDED`)
  - **기존 FMS 전용 차량을 리스 계약으로 백필** — "전용 차량 = MOCAR가 법인에 리스한 차량"으로 개념 정리 (기존 배차 모델과 자연 결합)
  - M3 `VehicleFinance`와의 구분을 주석으로 명시: VehicleFinance = MOCAR 원가 관점(구매/리스 매입·보험) / LeaseContract = 법인↔MOCAR 계약(법인 관점 비용, MOCAR 관점 매출 — M3 회계에서 리스 매출로 합산 가능)
- [x] **시드** — `viewer@demo.mocar.kr`(VIEWER) 추가(계정 6종) + 전용 차량들의 리스 계약(만기 임박 케이스 1건 포함). `SEED_VERSION +1`

## 산출물

- shared 등급/권한 상수 · 마이그레이션 1건(corpGrade + LeaseContract) · 시드 갱신

## 테스트

- **백엔드**: 마이그레이션 후 기존 계정 등급 매핑·전용 차량 리스 백필 검증(통합) · 기존 dispatch 통합 테스트 회귀
- **프론트**: 해당 없음

## 완료 기준

- migrate + seed 통과 · 기존 office/배차 기능 회귀 없음 · 전용 차량마다 ACTIVE 리스 계약 존재

## 참고

- [project-review.md](../project-review.md) §5.5b · 기존 Role enum 유지(HANDLER 등과 공존), 법인 내 세분화만 corpGrade

## 구현 메모 (2026-09-01)

- shared 단일 소스: `packages/shared/src/corp/grade.ts`
  - `CorpGrade` · `CORP_GRADES` · `CORP_GRADE_LABELS` · `CORP_GRADE_DESCRIPTIONS`
  - `CORP_PERMISSIONS: Record<CorpGrade, CorpPermissionSet>` — 권한 키 7종:
    `viewDispatch` · `createRequest` · `approve` · `viewBoard` · `manageMembers` · `manageFleet` · `manageSettings`
  - `hasCorpPermission(grade, permission)` · `corpGradeRank(grade)` · `corpGradeFromRole(role)`
  - `corpGradeSchema` · `updateCorpGradeSchema`(= `{ grade }`, M5-3의 `PATCH /biz/members/:id/grade` 용)
- 마이그레이션 `20260901091246_corp_grade_lease_contract` — enum 2종(`CorpGrade`·`LeaseStatus`) + `User.corpGrade` + `LeaseContract` + 백필 SQL(등급 매핑 · 전용 차량 → ACTIVE 리스 계약, 월 리스료 = 요금제 시간당 × 90h 만원 단위 반올림)
- `LeaseContract`에 M5-5의 연장/해지 워크플로용 필드를 미리 포함(`requestedById`·`requestedAt`·`requestedEndAt`·`requestNote`·`endedAt`) — 마일스톤당 마이그레이션 1건 규칙
- 시드 `SEED_VERSION=3`: 계정 5종(핸들러 계정은 M2에서 추가되어 6종이 됨), 리스 계약 3건(진행 2 + 만기 임박 1 포함, 종료 이력 1)
- 세션 응답(`AuthUser`/JWT)의 `corpGrade` 노출과 가드 적용은 M5-3 범위 — 이 작업에서는 하지 않았다
