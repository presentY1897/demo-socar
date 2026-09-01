# M2-4 — 배정 API (백오피스 측)

- 마일스톤: M2 (핸들러 시스템) · 규모 S
- 상태: ☑ 완료
- 의존: M2-1

## 목적

피드백 #5 "운송기사들한테 배차는 어떻게 할 것인지". 운영자가 작업을 핸들러에게 배정하는 API — 화면은 M3-6에서 올린다.

## 작업 내용

- [x] `GET /ops/tasks` — 전체 작업 목록 (미배정/진행 중/완료, 필터: 상태·타입·날짜). OPS 역할 가드 (`/ops/*` 프리픽스 시작점)
- [x] `POST /ops/tasks/:id/assign` {handlerId} — PENDING → ASSIGNED. 재배정 허용(진행 전만)
- [x] 배정 추천: 후보 핸들러를 "마지막 완료 작업 위치 → 출발 존" 거리순 정렬해 제공 (기존 배차 스코어링의 거리 계산 재사용, 완주한 작업이 없으면 기본 순서)
- [x] `POST /ops/tasks` — REPOSITION 수동 생성 (차량·출발/도착 존·기한)

## 산출물

- `apps/api/src/ops/`(신규 모듈 시작) — tasks controller/service

## 완료 기준

- 통합 테스트: 배정 → 핸들러 `GET /handler/tasks`에 반영 · 진행 중 재배정 400 · 추천 순서 검증 1건

## 테스트

- **백엔드(통합)**: 배정 → 핸들러 큐 반영 · 진행 중 재배정 400 · 추천 후보 거리순 정렬 검증 1건 · 비 OPS 접근 403
- **프론트**: 해당 없음 (화면은 M3-6)

## 결과 (2026-09-01)

### 엔드포인트 (모두 `OPS_ADMIN`)

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/ops/tasks?status=&type=&date=` | 전체 작업 목록 (기한 순, 최대 100건) |
| POST | `/ops/tasks` | `REPOSITION` 수동 생성 (차량·도착 존·기한) |
| GET | `/ops/tasks/:id/candidates` | 배정 후보 핸들러 — 거리순 + 근거 |
| POST | `/ops/tasks/:id/assign` | 배정·재배정 (이동 시작 전까지) |

응답은 핸들러 큐와 같은 `handlerTaskSchema`다 — 같은 자원을 두 화면이 다른 모양으로
받을 이유가 없다.

### 판단

- **모듈은 `src/ops/tasks/` 하위로.** `ops.module.ts`는 하위 모듈 목록만 갖는다 —
  M3-3에서 `/ops/*`가 도메인별로 늘어날 때 파일이 서로 부딪히지 않게
- **배정은 핸들러 수락과 같은 전이를 쓴다.** `PENDING → ASSIGNED`(첫 배정)와
  `ASSIGNED → ASSIGNED`(재배정)는 전이표(shared)에 이미 있는 문이고, `EN_ROUTE` 이후는
  같은 표가 막는다 — 재배정 거부는 **409**(작업 문서 초안의 400에서 변경, M2-3과 같은 이유)
- **추천은 점수가 아니라 거리 하나로 정렬한다.** 배차 스코어링(가중합)과 달리 사람을
  보내는 일이라 순서는 거리로 충분하고, 진행 중 작업 수 같은 사정은 근거 문장으로 보여 준다.
  거리는 배차의 후보 반경 판정과 같은 직선거리(haversine) — 후보 수만큼 A*를 돌릴 이유가 없다
- **"마지막 완료 위치" = 그 작업의 도착지.** 회수·재배치는 도착 존, 배달은 수령지 좌표다
- 재배치 생성의 출발 존은 차량이 실제 서 있는 존으로 고정한다. 운영자가 다른 존을 지정하면
  400 — 차가 없는 존에서 출발하는 작업은 아무도 수행할 수 없다

### 산출물

- `apps/api/src/ops/ops.module.ts` · `src/ops/tasks/`(controller/service/`handler-recommend.ts`)
- `packages/shared` — `assignHandlerTaskSchema` · `createRepositionTaskSchema` ·
  `opsTaskQuerySchema` · `handlerCandidateSchema`

### 테스트

- 통합 7건 (`test/ops-tasks.int-spec.ts`) — 역할 가드(OPS 200 / HANDLER 403 / 비로그인 401) ·
  배정 후 핸들러 큐 반영 · 재배정 · 이동 중 재배정 409와 비핸들러 배정 404 ·
  후보 거리순 · 재배치 생성과 3가지 거절 · 필터(상태·타입·날짜)와 잘못된 필터 400
- 단위 4건 (`src/ops/tasks/handler-recommend.spec.ts`) — 거리순 · 기록 없는 후보의 안정 정렬 ·
  근거 문장 · "한가해도 멀면 뒤로"

## 참고

- [project-review.md](../project-review.md) §5.3 · M3-3에서 `/ops/*`가 확장되므로 모듈 구조를 도메인별 하위 분리로
