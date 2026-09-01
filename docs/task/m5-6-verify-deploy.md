# M5-6 — M5 검증·문서·배포

- 마일스톤: M5 (MOCAR 비즈니스) · 규모 S
- 상태: ☑ 완료
- 의존: M5-4, M5-5

## 목적

M5 마감 — 서비스 분리·권한·리스 워크플로 전체 검증, 설계 기록, 배포.

## 작업 내용

- [x] 백엔드 권한 매트릭스·리스 워크플로 + 프론트 등급 분기·플릿 테스트 전건 통과 (README 테스트 숫자 갱신)
- [x] **ADR-010 작성** — [`docs/adr/010-biz-separation-and-permissions.md`](../adr/010-biz-separation-and-permissions.md)
- [x] README 갱신 — "법인 오피스" 섹션을 "MOCAR 비즈니스(법인 플릿/리스 관리)"로 재작성, /biz 경로·ADR-010 반영 (데모 계정 표는 M5-1·M5-3에서 이미 viewer·approver 추가됨)
- [x] ~~`SEED_VERSION` 확인 → main 머지 → 푸시 → 배포 스모크~~ — **배포는 사용자 결정으로 이번 세션 스코프 아웃 — 로컬 검증으로 대체** (`SEED_VERSION=5` 확인, build/lint/test/test:int 전건 통과)
- [x] work-plan 인덱스·작업 문서 상태 갱신
- [x] **정리 2건** — `dispatch/travel/` → `common/travel/` 이동(잔여 결합 #3 해소) · 동적 라우트 파라미터 `useParams()` 통일

## 산출물

- `docs/adr/010-biz-separation-and-permissions.md`(신규) · `apps/api/test/m5-e2e.int-spec.ts`(신규) · README 갱신
- 배포는 스코프 아웃 (사용자 결정)

## 테스트

- 마일스톤 전체 테스트 실행이 이 작업의 본문 (별도 신규 테스트 없음)

## 완료 기준

- ~~배포 URL에서~~ **로컬 통합 테스트에서**: viewer(조회만) → member(요청) → approver(승인) → admin(등급 변경·플릿 관리·리스 연장 요청) → ops(요청 처리)까지 권한대로 완주 (`test/m5-e2e.int-spec.ts` "동선 완주" 12단계)

## 참고

- [work-plan.md](../work-plan.md) 작업 단위 규칙

## 구현 메모 (2026-09-01)

### 검증 — 매트릭스를 손으로 적지 않는다

`apps/api/test/m5-e2e.int-spec.ts`(통합 72건) 신설. 기존 스위트(`biz-permissions` 27 ·
`biz-fleet-lease` 23)가 등급 × 권한을 이미 상당 부분 덮고 있어서, 이 스펙은 **덮이지 않던
두 가지**를 맡는다.

**① 매트릭스가 코드에서 기계적으로 파생되는가** — 엔드포인트 목록을 손으로 적지 않고
Nest 라우트 메타데이터(`PATH_METADATA`·`METHOD_METADATA`·`CORP_PERMISSION_KEY`)에서 뽑는다.
그래서 다음이 전부 테스트 실패가 된다:

- 권한 데코레이터 없이 `/biz` 엔드포인트를 추가 → "모든 /biz 엔드포인트가 권한을 선언한다" 실패
- 새 엔드포인트를 매트릭스 견본에 미등록 → "견본이 실제 라우트 목록과 일치" 실패
- 등급표만 고치고 가드를 안 고침 → 등급 × 엔드포인트 전수(52건)에서 실패
- `manageSettings` 외의 권한이 조용히 미사용이 됨 → "예약된 권한" 검사 실패

**② 빠져 있던 조합** (기존 스위트에 없던 것):

| 추가한 검증 | 이전 상태 |
|---|---|
| OPS_ADMIN의 `/biz` **전 13개 엔드포인트** 403 | `requests`·`members`·`fleet` 3개만 확인 |
| 법인 미소속 개인의 `/biz` 전 엔드포인트 403 | `requests`·`members` 2개만 |
| **미인증 → 401** (권한 판정 이전에 인증) | 없음 |
| `manageSettings`가 미사용 = "예약된 권한" | 없음 |
| `viewDispatch` 범위 = 법인 전체 (VIEWER가 **남이 낸** 요청을 본다) | 없음 — 계약 변경 ②의 근거 |
| 강등 즉시 반영 (승격만 있었다) | 승격만 |
| 전용 차량 예약이 과금 0 · 예약 명의는 **요청자** | 없음 |
| 동선 완주 12단계 (VIEWER→REQUESTER→APPROVER→MANAGER→ops→해지) | 단계별로 흩어져 있었다 |

시드 계약·계정은 건드리지 않는다 — 이 스위트가 만든 법인(전용존·리스 차량·등급 4종 계정)
안에서만 상태를 바꾸고 `afterAll`에서 지운다. 오피스 좌표를 시드 존에서 멀리 두어
후보 추천이 이 법인의 전용 차량으로 고정된다.

### ADR-010

`docs/adr/010-biz-separation-and-permissions.md` — 절 구성:
상황 / 결정 1 분리 경계와 추출 시나리오 / 결정 2 잔여 결합 10건 / 결정 3 Role vs corpGrade /
결정 4 shared 단일 소스 / 결정 5 등급 DB 재조회 / 결정 6 **문서에 없던 계약 변경 2건**
(OPS_ADMIN의 `/biz` 차단 · `viewDispatch` 범위 통일) / 결정 7 전용 차량 = 리스 계약 +
상태 전이도 / 예약된 권한 `manageSettings` / 결과.

### 정리 2건 (M5가 만든/드러낸 부채)

- **`apps/api/src/dispatch/travel/` → `apps/api/src/common/travel/`** (`git mv`).
  M5-2 잔여 결합 #3. 임포터 3곳(`reservations.module`·`reservations.service`,
  `zones.module`·`zones.service`, biz `dispatch.module`·`dispatch.service`)을 갱신하고
  `travel.module.ts` 헤더의 "보류" 문구를 지웠다. `apps/api/src/dispatch/`는 없어졌다
  (그래프 파일 경로는 `process.cwd()` 기준이라 이동 영향 없음)
- **동적 라우트 파라미터 규약 통일** — 클라이언트 화면은 전부 `useParams()`.
  `app/book/[vehicleId]` · `app/reservations/[id]` · `app/vehicles/[id]/manual`을 옮기고
  (biz 화면은 이미 `useParams()`), 더는 쓰이지 않는 `src/test/utils.tsx`의 `routeParams`
  헬퍼를 제거, `src/test/README.md`의 규칙을 "왜 한쪽으로 통일했는지"까지 적어 갱신했다

### 최종 집계

| 구분 | 이전 | 이후 |
|---|---|---|
| 단위 (shared 73 + api 20) | 66 | **93** |
| 프론트 (Vitest+RTL+MSW) | 51 | **106** |
| 통합 (Supertest + PostgreSQL) | 58 | **194** |

`pnpm build` → `pnpm lint` → `pnpm test` → `cd apps/api && pnpm test:int` 전건 통과
(turbo 캐시 강제 무효화 `--force` 포함).
