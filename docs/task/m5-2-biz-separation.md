# M5-2 — 비즈 서비스 분리 (/biz 바운디드 컨텍스트)

- 마일스톤: M5 (MOCAR 비즈니스) · 규모 M
- 상태: ☑ 완료
- 의존: M5-1

## 목적

3차 피드백 핵심: "**분리해서 처리 가능하게** 서비스를 구성". 법인 기능을 소비자 앱에 섞인 부속이 아니라, 나중에 별도 앱/배포로 추출할 수 있는 **분리된 서비스 경계(바운디드 컨텍스트)**로 재배치한다.

## 작업 내용

- [x] **웹** — `/biz` 라우트 그룹 신설 + `BizShell`(별도 내비·"MOCAR 비즈니스" 브랜딩, 소비자 AppShell과 분리):
  - 기존 `/office` → `/biz/dispatch`, `/office/board` → `/biz/board` 이동 (구 경로는 리다이렉트)
  - 법인 계정 로그인 후 랜딩을 `/biz`로
- [x] **API** — `apps/api/src/biz/` 바운디드 컨텍스트로 재배치:
  - 기존 dispatch 모듈을 biz 하위로 이동, URL 프리픽스 `/biz/dispatch/*`로 변경 (웹·통합 테스트 동시 갱신)
  - 이후 M5 작업(멤버·플릿·리스)도 전부 `/biz/*` 네임스페이스에 추가
- [x] **분리 경계 문서화** — "별도 서비스로 추출한다면 여기서 자른다"를 명시: biz 모듈이 소비자 도메인(zones/reservations)을 직접 import하지 않고 공용 서비스 인터페이스만 사용하도록 의존 방향 정리. 남는 결합 지점(차량 가용성 판정 등)은 목록화해 ADR-010 대상
- [ ] 데모 계정 안내·README 경로 갱신은 M5-6에서 일괄

## 산출물

- `/biz` 라우트 그룹 + BizShell · `apps/api/src/biz/` 재배치 · 구 경로 리다이렉트

## 테스트

- **백엔드**: 이동한 dispatch 통합 테스트 전건 회귀 (새 경로 기준)
- **프론트(MSW)**: BizShell 렌더·내비 스모크 · 구 /office 접근 시 /biz 리다이렉트

## 완료 기준

- 법인 계정 동선이 /biz 아래에서 전부 동작, 구 경로 접근도 깨지지 않음 · biz → 소비자 도메인 직접 의존이 정리된 상태(잔여 결합은 목록화)

## 참고

- [m5-1](m5-1-corp-grade-domain.md) · 분리 설계 기록은 ADR-010([m5-6](m5-6-verify-deploy.md))

## 구현 메모 (2026-09-01)

### 옮긴 것

| 이전 | 이후 |
|---|---|
| `apps/api/src/dispatch/{dispatch.controller,dispatch.service,dispatch.module,scoring}.ts` | `apps/api/src/biz/dispatch/` |
| API `POST/GET /dispatch/*` | `/biz/dispatch/*` (구 경로는 404 — 데모 웹만 쓰던 내부 API라 남기지 않았다) |
| 웹 `/office` · `/office/board` | `/biz/dispatch` · `/biz/board` (구 경로는 `next.config` 영구 리다이렉트) |

- `apps/api/src/biz/biz.module.ts` — biz 컨텍스트 루트. 이후 M5 작업(멤버·플릿·리스)도 여기 하위에 붙인다
- `apps/web/src/components/BizShell.tsx` — "MOCAR 비즈니스" 전용 셸(인디고 브랜딩·전용 내비·소비자 앱 복귀 링크). `AppShell`이 `/biz` 경로에서 이 셸로 갈라진다
- 법인 계정 로그인 랜딩은 `/biz` (→ `/biz/dispatch` 리다이렉트)

### 추출 경계 — "별도 서비스로 떼면 여기서 자른다"

- **`apps/api/src/biz/ports/reservation-booking.port.ts`** — biz가 소비자 도메인으로 나가는 유일한 서비스 인터페이스(`RESERVATION_BOOKING` 토큰). `dispatch.service.ts`는 `ReservationsService`를 더 이상 import 하지 않는다
- **`apps/api/src/biz/adapters/reservations-booking.adapter.ts`** — 그 포트의 in-process 구현이자 biz 안에서 `reservations`를 아는 **유일한 파일**. 추출 시 이 클래스만 HTTP 클라이언트로 교체
- **웹**: `AppShell`의 `/biz` 분기 1줄 + `next.config` 리다이렉트. `/biz` 라우트 그룹과 `BizShell`을 그대로 새 앱의 루트로 옮길 수 있다

### 잔여 결합 목록 (ADR-010 대상)

| # | 결합 지점 | 내용 | 추출 시 필요한 것 |
|---|---|---|---|
| 1 | **공용 DB 직접 조회** | `dispatch.service`의 후보 탐색·보드가 `zone`/`vehicle`/`reservation`/`rental` 테이블을 Prisma로 직접 읽는다 (반경 필터·겹침 판정·지연 리스크 집계) | "차량 가용성 조회" 읽기 API 또는 읽기 전용 복제 |
| 2 | **차량 가용성 판정 규칙** | 겹침 판정과 편도 위치 체인(`common/vehicle-location`의 `effectiveZoneIdAt`, ADR-005)을 biz가 자체 구현으로 재현 중 | 가용성 판정을 소비자 도메인 API로 노출하고 biz는 결과만 소비 |
| 3 | **이동시간 추정기 위치** | `TRAVEL_ESTIMATOR`는 포트로 잘 분리돼 있으나 파일이 `apps/api/src/dispatch/travel/`에 남아 있다 (zones·reservations도 함께 쓰는 공용 인프라). M1 병행 작업이 임포터를 쥐고 있어 이동을 미뤘다 | `src/common/travel/`로 이동 + 임포터 2곳(`reservations`, `zones`) 경로 갱신 |
| 4 | **예약 충돌 계약** | 어댑터가 Nest `ConflictException`을 그대로 흘린다 — 프로세스 내 호출이라 성립 | 원격 409 → 도메인 예외 번역을 어댑터에 넣기 |
| 5 | **인증 세션 공유** | 같은 JWT·`JwtAuthGuard`를 소비자 앱과 공유 | 별도 배포 시 토큰 발급자/검증 공유(JWKS) 또는 biz 전용 세션 |
| 6 | **루트 레이아웃 공유(웹)** | `AppShell`이 경로로 두 셸을 가른다 | 별도 앱 분리 시 이 분기 제거 |
