# M5-3 — 권한 가드 + 등급 관리 API

- 마일스톤: M5 (MOCAR 비즈니스) · 규모 M
- 상태: ☐ 대기
- 의존: M5-2

## 목적

등급→권한 매핑을 API 레벨에서 강제하고, MANAGER가 멤버 등급을 부여·변경하는 API를 biz 네임스페이스에 만든다.

## 작업 내용

- [ ] **권한 가드** — NestJS 가드/데코레이터 `@RequireCorpPermission('approve')` — 판정은 shared `CORP_PERMISSIONS` 상수 (프론트 분기와 단일 소스, 가드에 하드코딩 금지)
- [ ] **biz dispatch API에 적용** (M5-2에서 이동한 경로 기준):
  - `POST /biz/dispatch/requests` → `createRequest` (REQUESTER+)
  - `GET /biz/dispatch/requests`·`/requests/:id` → 조회 권한 (VIEWER+)
  - `approve`/`reject` → `approve` (APPROVER+)
  - `GET /biz/dispatch/board` → APPROVER+
- [ ] **등급 관리 API**:
  - `GET /biz/members` — 법인 멤버 목록 + 등급 (MANAGER)
  - `PATCH /biz/members/:id/grade` — 등급 부여/변경 (MANAGER). 자기 자신 강등 불가(MANAGER 0명 방지) · 타 법인 403
- [ ] 세션 응답(`GET /auth/me`)에 corpGrade 포함

## 산출물

- biz members controller/service · 권한 가드 · dispatch controller 적용

## 테스트

- **백엔드**: 권한 매트릭스 통합 — 등급 4종 × biz 엔드포인트별 허용/403 전수 · 자기 강등 400 · 타 법인 403
- **프론트**: 해당 없음 (화면 분기는 M5-4)

## 완료 기준

- 매트릭스 테스트 전건 통과 · VIEWER 계정으로 요청 생성 시도 → 403

## 참고

- [m5-1](m5-1-corp-grade-domain.md)의 권한 상수가 유일한 판정 기준
