# M2-6 — M2 검증·문서·배포

- 마일스톤: M2 (핸들러 시스템) · 규모 S
- 상태: ☑ 완료
- 의존: M2-2 ~ M2-5

## 목적

M2 마일스톤 마감 — 부름 전 과정이 사람(핸들러)의 작업으로 이어지는 흐름을 검증하고 배포한다.

## 작업 내용

- [x] 통합 테스트: 부름 전 과정 시나리오 — 부름 예약 → DELIVERY 자동 생성 → 배정 → 완료 → 이용 → 반납 → RETRIEVE 생성 → 완료 → 차량 원래 존 복귀 (`apps/api/test/m2-e2e.int-spec.ts`, 12건)
- [x] 백엔드 + 프론트(MSW) 테스트 전건 통과 (단위 105 · 프론트 117 · 통합 229)
- [x] **ADR-008 작성** — [`008-handler-task-system.md`](../adr/008-handler-task-system.md):
      작업 자동 생성 트리거와 트랜잭션 경계, 상태 전이도와 주체, 상태 코드 규약,
      완료 시 차량 위치 반영과 위치 체인(ADR-005)의 역할 분담, 근거 기반 배정 추천
- [x] README 갱신: 데모 계정 표 7종(핸들러 포함) · 기능 섹션에 핸들러 시스템 · 테스트 집계 실측값
- [x] `SEED_VERSION` 확인 (M2-1에서 6으로 올라감 — 핸들러 계정·샘플 작업 포함. 추가 변경 없음)
- [ ] ~~main 머지 → 푸시 (Vercel/Render 자동 배포)~~ — **배포는 사용자 결정으로 이번 세션 스코프 아웃**
- [x] ~~배포 스모크: 핸들러 계정 동선 완주~~ —
      **배포는 사용자 결정으로 이번 세션 스코프 아웃 — 로컬 E2E 통합 테스트로 대체**
      (`apps/api/test/m2-e2e.int-spec.ts` 12건)
- [x] work-plan 인덱스·작업 문서 상태 갱신

## 산출물

- `docs/adr/008-handler-task-system.md`(신규) · `apps/api/test/m2-e2e.int-spec.ts`(신규) ·
  `apps/web/src/app/__tests__/login.test.tsx`(신규) · README 갱신

## 완료 기준

- 개인 계정(부름 예약)과 핸들러 계정(배달·회수 완료)을 오가며 전 과정 완주

## 결과 (2026-09-01)

### M2 부름 전 과정 E2E 통합 테스트 (`test/m2-e2e.int-spec.ts`, 12건)

배포 스모크를 대신하는 자리다. 개별 기능의 경계 조건은 각 스펙(`handler-task-autocreate` ·
`handler-api` · `ops-tasks` · `bureum`)이 덮으므로, 이 스펙이 보는 것은 **예약·이용·작업이
각각 다른 액터·다른 트랜잭션에서 일어나는데도 한 대의 차가 존을 떠났다가 제자리로 돌아오는가**다.

| # | 단계 | 확인하는 것 |
|---|---|---|
| ① | 부름 예약 결제 | 결제와 **같은 트랜잭션**에서 `DELIVERY` 1건 생성 · `PENDING`/미배정 · 출발 = 유효 존 · 도착 = 수령지 좌표 · **기한 = 시작 − 60분** |
| ② | **게이트** 화면 경계 | 핸들러·이용자 → `/ops/tasks` 403 · 운영자 → `/handler/tasks` 403 · 미인증 401 |
| ③ | 운영자 후보 조회 → 배정 | 후보에 **점수 필드 없음**, 근거 문장(마지막 완료 지점 거리 · 진행 중 작업 수) · 배정 즉시 그 핸들러 큐로, 공개 목록에서 제외 |
| ④ | **게이트** 남의 작업 조작 | `start` 403 · `complete`도 **409가 아니라 403** (소유 검사가 전이 검사보다 앞) |
| ⑤ | **게이트** 건너뛴 전이 | `ASSIGNED`에서 완료 409 · 이미 배정된 작업 재수락 409 |
| ⑥ | 이동 시작 | `EN_ROUTE` · 이 상태에서 **재배정 409**, 거절된 요청은 흔적 없음 |
| ⑦ | **게이트** 인계 증빙 누락 | 사진 0장 400 · 메모 빈 문자열 400 · 작업도 차량도 불변 |
| ⑧ | 배달 완료 | `DONE` + 인계 사진 1장 · 차량 잠김/시동 꺼짐 · **소속 존 불변**(제자리 회수) · 큐 → 이력 이동 |
| ⑨ | 이용자 이용 시작 | 체크인 전 스마트키 403(ADR-007) → 체크인 → UNLOCK/시동/LOCK |
| ⑩ | 체크아웃 → 반납·정산 | 체크아웃 전 반납 409 · 정산 완료와 **같은 트랜잭션**에서 `RETRIEVE` 생성(수령지 → 원래 존, 기한 = 반납 + 120분) |
| ⑪ | 핸들러 수락 | 공개 작업으로 떠 있음 → 수락(운영자를 거치지 않는 문) · 늦게 온 다른 핸들러 409 |
| ⑫ | 회수 완료 | **차량이 원래 존으로 복귀** · 미완료 작업 0건 · 존 검색의 "바로 픽업" 목록에 재등장 · 결제 합계 정합 |

게이트 위반 4종(② 403 · ④ 403 · ⑤⑥⑪ 409 · ⑦ 400)을 별도 스펙이 아니라 **같은 동선 안에서** 확인한다.

### 회귀 점검 — M2 × M5 리베이스 통합 지점

이 브랜치는 M2 커밋들을 M5 위로 리베이스한 결과라, "양쪽이 각자 늘린 배열/객체/모듈 목록"이
자동 머지로 조용히 통과한 지점을 훑었다.

| 지점 | 결과 |
|---|---|
| `run-seed.ts` 계정 배열 | 앞선 커밋에서 위치 기반 구조 분해 → `byEmail` 조회로 수정됨(핸들러 작업이 승인자에게 배정되던 버그). **같은 패턴이 요금제 4종·법인 전용 차량 2종에 남아 있어** `seeded(rows, key, value)` 헬퍼로 통일 |
| `run-seed.ts` 샘플 재배치 작업 | `taskZones[2] ?? taskZones[0]` 폴백 — 존이 모자라면 배달 작업과 **같은 차량**을 집어 한 대에 살아 있는 작업이 두 건 생긴다. "아직 작업이 없는 차량" 기준 선택으로 교체 |
| `app.module.ts` | M2-4가 추가한 `OpsModule`이 M5가 이미 넣어 둔 것과 **중복 등록**(줄이 달라 충돌 없이 둘 다 남음) — 중복 제거. `OpsTasksModule`은 `ops.module.ts`가 물고 있어 기능 손실 없음 |
| `msw/handlers.ts` 로그인 목 계정 | M2가 픽스처(`userHandler`)와 `MOCK_USERS`는 늘렸는데 **M5가 키운 `DEMO_ACCOUNTS` 배열에는 못 들어가** 핸들러 로그인이 401. 추가 + 회귀 테스트로 고정 |
| `msw/fixtures.ts` 법인 관리자 이메일 | 픽스처만 `corpadmin@`, 시드·로그인 화면·README는 `admin@` — 시드 쪽으로 통일 |
| `packages/shared` 배럴 (`index.ts` · `schemas/api.ts`) | M2 스키마(`handler-task` · `handlerTask*`/`handlerQueue`/`handlerCandidate`)와 M5 스키마 모두 재export — 누락 없음 |
| `Role` enum 5곳 (prisma · shared 타입 · `roleSchema` · 시드 · MSW) | `HANDLER` 전부 존재 |
| `CorpGrade` 4종 (prisma · `CORP_PERMISSIONS` 등 6개 `Record` · 시드 · MSW) | 전부 4종 일치 |
| `AppShell.tsx` · `BizShell.tsx` | 핸들러(`/handler`)와 M5 법인 탭 모두 등록, 역할별 분기 테스트가 고정 |
| `handler.module.ts` · `handler.service.ts` | 앞선 커밋에서 M5가 옮긴 `common/travel` 경로로 수정됨 — 옛 `dispatch/travel*` 참조 잔재 없음 |
| prisma 마이그레이션 순서 | M5(`corp_grade_lease_contract`) → M2(`handler_domain`) 타임스탬프 순 |

**새 회귀 테스트** `apps/web/src/app/__tests__/login.test.tsx` — 데모 계정 목록은 세
곳(로그인 화면 · API 시드 · MSW 목)이 각자 늘어나는 배열이라, 목록을 손으로 적지 않고
**화면에 렌더된 버튼에서 뽑아 전부 눌러 본다.** 한쪽만 늘면 여기서 먼저 터진다.

### 테스트 집계

| 갈래 | 건수 | 실행 |
|---|---|---|
| 단위 (shared 81 + api 24) | 105 | `pnpm test` |
| 프론트 (Vitest + RTL + MSW) | 117 | `pnpm --filter @socar/web test` |
| 통합 (Supertest + PostgreSQL) | 229 | `pnpm --filter @socar/api test:int` |

`pnpm turbo run build --force` · `pnpm turbo run lint test --force` · `pnpm --filter @socar/api test:int`
전건 통과. `pnpm db:seed` 재실행으로 시드 변경분도 확인
(v6, zones=30, vehicles=71, handlerTasks=3 — 배달/회수/재배치가 서로 다른 차량·존에 배치).

### 배포는 이번 세션 스코프 아웃

작업 문서 초안의 "main 머지 → 푸시 → 배포 스모크"는 **사용자 결정으로 이번 세션에서 제외**했다.
`SEED_VERSION`은 M2-1에서 6으로 올라가 있어(핸들러 계정 + 샘플 작업 포함) 배포 시 자동 재시드
조건은 이미 충족돼 있고, 배포 시점에 추가로 손댈 것은 없다.

## 참고

- [work-plan.md](../work-plan.md) 작업 단위 규칙 · [ADR-008](../adr/008-handler-task-system.md)
