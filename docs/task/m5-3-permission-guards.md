# M5-3 — 권한 가드 + 등급 관리 API

- 마일스톤: M5 (MOCAR 비즈니스) · 규모 M
- 상태: ☑ 완료
- 의존: M5-2

## 목적

등급→권한 매핑을 API 레벨에서 강제하고, MANAGER가 멤버 등급을 부여·변경하는 API를 biz 네임스페이스에 만든다.

## 작업 내용

- [x] **권한 가드** — NestJS 가드/데코레이터 `@RequireCorpPermission('approve')` — 판정은 shared `CORP_PERMISSIONS` 상수 (프론트 분기와 단일 소스, 가드에 하드코딩 금지)
- [x] **biz dispatch API에 적용** (M5-2에서 이동한 경로 기준):
  - `POST /biz/dispatch/requests` → `createRequest` (REQUESTER+)
  - `GET /biz/dispatch/requests`·`/requests/:id` → 조회 권한 (VIEWER+)
  - `approve`/`reject` → `approve` (APPROVER+)
  - `GET /biz/dispatch/board` → APPROVER+
- [x] **등급 관리 API**:
  - `GET /biz/members` — 법인 멤버 목록 + 등급 (MANAGER)
  - `PATCH /biz/members/:id/grade` — 등급 부여/변경 (MANAGER). 자기 자신 강등 불가(MANAGER 0명 방지) · 타 법인 403
- [x] 세션 응답(`GET /auth/me`)에 corpGrade 포함

## 산출물

- biz members controller/service · 권한 가드 · dispatch controller 적용

## 테스트

- **백엔드**: 권한 매트릭스 통합 — 등급 4종 × biz 엔드포인트별 허용/403 전수 · 자기 강등 400 · 타 법인 403
- **프론트**: 해당 없음 (화면 분기는 M5-4)

## 완료 기준

- 매트릭스 테스트 전건 통과 · VIEWER 계정으로 요청 생성 시도 → 403

## 참고

- [m5-1](m5-1-corp-grade-domain.md)의 권한 상수가 유일한 판정 기준

## 구현 메모 (2026-09-01)

### 가드

- `apps/api/src/biz/corp-permission.guard.ts` — `@RequireCorpPermission(...perms)` 데코레이터 + `CorpPermissionGuard`(컨트롤러에 `@UseGuards`). 전역 가드가 아니라 biz 컨텍스트가 자기 권한 모델을 소유한다
- 판정은 `hasCorpPermission`(= shared `CORP_PERMISSIONS`)만 호출한다 — 등급→권한 표를 가드가 다시 적지 않는다
- **등급은 JWT가 아니라 DB에서 다시 읽는다**: MANAGER가 등급을 낮춰도 상대 토큰(7일)이 살아 있는 동안 옛 권한이 남으면 안 되기 때문. 통합 테스트가 "토큰 재발급 없이 즉시 반영"으로 이걸 고정한다
- 권한이 통과한 뒤 서비스는 **테넌시(다른 법인 침범)만** 확인한다 — 판정 중복을 없애 상수와 갈라질 여지를 제거

### 엔드포인트별 요구 권한

| 엔드포인트 | 권한 | 허용 등급 |
|---|---|---|
| `POST /biz/dispatch/requests` | `createRequest` | REQUESTER+ |
| `GET /biz/dispatch/requests` · `/requests/:id` | `viewDispatch` | VIEWER+ |
| `POST /biz/dispatch/requests/:id/approve` · `/reject` | `approve` | APPROVER+ |
| `GET /biz/dispatch/board` | `viewBoard` | APPROVER+ |
| `GET /biz/members` · `PATCH /biz/members/:id/grade` | `manageMembers` | MANAGER |

### 결정 (작업 문서에 없던 지점)

- **`/biz/*`는 법인 등급이 있어야 들어간다** — 운영 어드민(OPS_ADMIN)도 403. 기존 `GET /dispatch/requests/:id`가 갖고 있던 OPS_ADMIN 조회 예외는 제거했다. 바운디드 컨텍스트를 나눈 이상 운영 도구는 M3 `/ops` 쪽에서 자기 경로로 봐야 한다
- **`viewDispatch` = "법인 배차 현황 조회"** 하나로 통일 — 등급별로 조회 범위를 다시 쪼개지 않는다. 기존에는 CORP_MEMBER가 본인 요청만 봤지만, VIEWER 등급의 정의('배차 현황 조회만 가능')와 맞추려면 범위가 아니라 권한 하나로 갈리는 편이 일관적이다
- **자기 강등 금지**는 "본인 등급을 현재보다 낮추는 변경 400"으로 구현 (MANAGER가 유일 호출자이므로 사실상 자기 등급 변경 전체가 막힌다)
- **웹**: `BizShell` 탭 노출과 배차 화면의 승인/반려 버튼을 `hasCorpPermission`으로 바꿨다 (역할 → 등급). `approver` 계정이 도입되는 순간 화면이 어긋나지 않도록 최소한만 옮겼고, 등급 관리 UI·나머지 분기는 M5-4 범위 그대로다

### 데모 계정

- `approver@demo.mocar.kr`(정승인, Role=CORP_MEMBER / 등급 APPROVER) 추가 — `SEED_VERSION 3 → 4`. Role이 임직원인데 승인·보드가 되는 계정이라 "권한은 역할이 아니라 등급에서 나온다"를 한 번에 보여준다
- README 데모 계정 표 + 로그인 화면 바로가기 버튼도 등급 표기로 갱신 (계정 6종)
