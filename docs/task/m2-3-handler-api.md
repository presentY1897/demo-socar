# M2-3 — 핸들러 API

- 마일스톤: M2 (핸들러 시스템) · 규모 M
- 상태: ☑ 완료
- 의존: M2-2

## 목적

핸들러가 자기 작업을 받아 처리하는 API. 상태 전이 규칙과 완료 시 실물 반영(차량 위치)이 핵심.

## 작업 내용

- [x] `apps/api/src/handler/` 신규 모듈 (HANDLER 역할 가드):
  - `GET /handler/tasks` — 내 배정 작업 + 미배정 공개 작업(수락 가능), 오늘/예정 구분, dueAt 순
  - `POST /handler/tasks/:id/accept` — PENDING → ASSIGNED(본인)
  - `POST /handler/tasks/:id/start` — ASSIGNED → EN_ROUTE
  - `POST /handler/tasks/:id/complete` — EN_ROUTE → DONE. **인계 사진 + 메모 필수**(M1-2 재사용)
- [x] 상태 전이 규칙: 역순/건너뛰기 400, 타인 배정 작업 조작 403, dueAt 경과 작업은 목록에 지연 표시
- [x] 완료 시 실물 반영:
  - DELIVERY 완료 → 차량을 수령지 상태로 (부름 이용 시작 가능 상태)
  - RETRIEVE/REPOSITION 완료 → `vehicle.zoneId` 목적지 존으로 갱신 + 상태 복귀

## 산출물

- handler 모듈(controller/service) · shared 상태 전이 스키마

## 완료 기준

- 통합 테스트: 정상 전이 완주 · 건너뛰기 400 · 타인 작업 403 · RETRIEVE 완료 후 vehicle.zoneId 갱신 확인

## 테스트

- **백엔드(통합)**: 상태 전이 매트릭스(정상 완주·건너뛰기 400·역행 400) · 타인 작업 403 · 완료 시 사진 누락 400 · RETRIEVE 완료 후 vehicle.zoneId 갱신
- **프론트**: 해당 없음 (화면은 M2-5)

## 결과 (2026-09-01)

### 엔드포인트 (모두 `HANDLER` 역할)

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/handler/tasks` | `today`(기한이 오늘) / `upcoming` / `open`(미배정 공개) / `done`(최근 7일 완료) |
| POST | `/handler/tasks/:id/accept` | PENDING → ASSIGNED(본인) |
| POST | `/handler/tasks/:id/start` | ASSIGNED → EN_ROUTE |
| POST | `/handler/tasks/:id/complete` | EN_ROUTE → DONE · 인계 사진 + 메모 필수 |

응답은 `handlerTaskSchema`(shared) 한 형태다 — M2-4의 운영 목록도 같은 모양을 내려준다.
목록에는 base64 사진을 싣지 않고(용량), 완료 응답에만 `photos`가 실린다.

### 완료 시 실물 반영

| 작업 | vehicle.zoneId | 문/시동 |
|---|---|---|
| `DELIVERY` | **그대로** | 잠김 / 꺼짐 |
| `RETRIEVE` · `REPOSITION` | 도착 존(`toZoneId`)으로 갱신 | 잠김 / 꺼짐 |

배달에서 존을 옮기지 않는 게 핵심이다. 부름은 수령지에서 이용하고 같은 자리에서
회수해 원래 존으로 돌아오므로(ADR-006 제자리 회수), 배달 시점에 존을 옮기면
위치 체인(ADR-005)이 실제와 어긋난다. 차가 다른 존에 자리 잡는 건 회수·재배치가 끝날 때다.
문/시동은 어느 작업이든 "잠긴 채 인계" — 다음 사람이 스마트키로 여는 게 정상 흐름이다.

### 판단

- **전이 위반은 409**(작업 문서 초안의 400에서 변경). 자원의 현재 상태와 충돌한 요청이지
  잘못된 입력이 아니다 — 기존 코드도 상태 충돌에는 409를 쓴다(체크인 재제출 등).
  400은 입력 검증(사진·메모 누락)에 남겼다
- **소유 검사가 전이 검사보다 앞선다.** 남의 작업은 상태와 무관하게 403 — 남의 작업의
  현재 상태를 응답으로 알려줄 이유가 없다
- 오늘/예정은 서버 로컬 자정 경계, 이력은 최근 7일 창(화면이 오늘/이번 주로 나눈다)
- 이동 시간은 활성 작업에만 A*로 계산한다. 끝난 이력에 경로 계산을 돌릴 이유가 없다

### 산출물

- `apps/api/src/handler/` — `handler.controller.ts` · `handler.service.ts` ·
  `handler-task.mapper.ts`(응답 변환, M2-4와 공유) · `handler.module.ts`
- `packages/shared` — `completeHandlerTaskSchema`(요청) · `handlerTaskSchema`/`handlerQueueSchema`/
  `taskPlaceSchema`(응답) · `roleSchema`에 빠져 있던 `HANDLER` 추가

### 테스트

- 통합 7건 (`test/handler-api.int-spec.ts`) — 큐 분류/정렬/지연 표시 · 수락→이동→완료 완주와
  차량 존 갱신 · 배달 완료 시 존 유지 · 전이 매트릭스(건너뛰기·역행·종착 409) ·
  남의 작업 403 · 사진/메모 누락 400 · 비 HANDLER 403, 비로그인 401

## 참고

- [project-review.md](../project-review.md) §5.3 · 위치 체인([ADR-005](../adr/005-oneway-vehicle-location.md))과의 정합 주의 — 완료 시점 물리 위치 갱신
