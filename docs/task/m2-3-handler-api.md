# M2-3 — 핸들러 API

- 마일스톤: M2 (핸들러 시스템) · 규모 M
- 상태: ☐ 대기
- 의존: M2-2

## 목적

핸들러가 자기 작업을 받아 처리하는 API. 상태 전이 규칙과 완료 시 실물 반영(차량 위치)이 핵심.

## 작업 내용

- [ ] `apps/api/src/handler/` 신규 모듈 (HANDLER 역할 가드):
  - `GET /handler/tasks` — 내 배정 작업 + 미배정 공개 작업(수락 가능), 오늘/예정 구분, dueAt 순
  - `POST /handler/tasks/:id/accept` — PENDING → ASSIGNED(본인)
  - `POST /handler/tasks/:id/start` — ASSIGNED → EN_ROUTE
  - `POST /handler/tasks/:id/complete` — EN_ROUTE → DONE. **인계 사진 + 메모 필수**(M1-2 재사용)
- [ ] 상태 전이 규칙: 역순/건너뛰기 400, 타인 배정 작업 조작 403, dueAt 경과 작업은 목록에 지연 표시
- [ ] 완료 시 실물 반영:
  - DELIVERY 완료 → 차량을 수령지 상태로 (부름 이용 시작 가능 상태)
  - RETRIEVE/REPOSITION 완료 → `vehicle.zoneId` 목적지 존으로 갱신 + 상태 복귀

## 산출물

- handler 모듈(controller/service) · shared 상태 전이 스키마

## 완료 기준

- 통합 테스트: 정상 전이 완주 · 건너뛰기 400 · 타인 작업 403 · RETRIEVE 완료 후 vehicle.zoneId 갱신 확인

## 테스트

- **백엔드(통합)**: 상태 전이 매트릭스(정상 완주·건너뛰기 400·역행 400) · 타인 작업 403 · 완료 시 사진 누락 400 · RETRIEVE 완료 후 vehicle.zoneId 갱신
- **프론트**: 해당 없음 (화면은 M2-5)

## 참고

- [project-review.md](../project-review.md) §5.3 · 위치 체인([ADR-005](../adr/005-oneway-vehicle-location.md))과의 정합 주의 — 완료 시점 물리 위치 갱신
