# M5-4 — 등급 관리 UI + 등급별 화면 분기

- 마일스톤: M5 (MOCAR 비즈니스) · 규모 M
- 상태: ☑ 완료
- 의존: M5-3

## 목적

MANAGER가 화면에서 등급을 부여하고, 각 등급은 자기 권한만큼만 보고 조작할 수 있게 한다. 전부 `/biz` 영역 기준.

## 작업 내용

- [x] **멤버 관리 탭** (`/biz/members`, MANAGER 전용):
  - 법인 멤버 목록(이름·이메일·등급) + 등급 변경 드롭다운(`PATCH /biz/members/:id/grade`)
  - 자기 자신 행은 등급 변경 비활성 + 사유 툴팁
- [x] **등급별 화면 분기** — shared `CORP_PERMISSIONS`로 판정 (API 가드와 동일 소스):
  - VIEWER: 요청 생성 폼·승인 버튼 숨김 — 현황 조회만
  - REQUESTER: 생성 가능, 승인 UI 숨김
  - APPROVER: 승인/반려 + 타임라인 보드
  - MANAGER: + 멤버 관리·플릿/리스(M5-5) 탭 노출
- [x] 권한 없는 URL 직접 접근(예: VIEWER가 /biz/board) 시 안내 화면 (403 처리)
- [x] BizShell 내비를 등급 반영으로

## 산출물

- /biz/members 탭 · biz 화면 등급 분기 · 세션 훅에 corpGrade

## 테스트

- **백엔드**: 해당 없음 (M5-3에서 완료)
- **프론트(MSW)**: 등급 4종 세션 목킹으로 분기 전수 — 등급별 버튼/탭 노출·숨김 · VIEWER의 board 접근 안내 화면 · 등급 변경 요청 페이로드 검증

## 완료 기준

- viewer/member/admin 계정 로그인 시 화면이 권한대로 다르게 보임 · MANAGER 등급 변경 → 대상 계정 재로그인 시 반영

## 참고

- [m5-3](m5-3-permission-guards.md) · UI 분기와 API 가드는 같은 상수 사용이 원칙

## 구현 메모 (2026-09-01)

### 화면

| 경로/요소 | 필요 권한 | 보이는 등급 |
|---|---|---|
| `/biz/dispatch` 목록 | `viewDispatch` | VIEWER+ |
| `/biz/dispatch` 요청 폼 | `createRequest` | REQUESTER+ |
| `/biz/dispatch` 승인·반려 버튼 | `approve` | APPROVER+ |
| `/biz/board` 화면 · 보드 탭 | `viewBoard` | APPROVER+ |
| `/biz/members` 화면 · 멤버 탭 | `manageMembers` | MANAGER |

- `components/BizPermissionGate.tsx` — 화면 단위 게이트. 탭을 숨겨도 URL로는 들어올 수 있어서, 권한이 없으면 본문을 아예 렌더하지 않고(= API 호출도 없음) "현재 등급 / 필요 등급"을 안내한다
- 안내 문구의 **필요 등급은 손으로 적지 않는다** — shared에 추가한 `minimumGradeFor(permission)`가 `CORP_PERMISSIONS`에서 최저 등급을 뽑는다. 등급표를 고치면 안내도 같이 따라온다
- `/biz/board`가 쓰던 `role === 'CORP_ADMIN'` 판정을 없앴다 (M5-3에서 API는 이미 `viewBoard`로 갈렸는데 화면만 역할로 남아 있어 APPROVER가 탭은 보이는데 화면은 막히는 상태였다)
- `/biz/members` — 멤버 카드 + 등급 드롭다운(`PATCH /biz/members/:id/grade`). **본인 행은 드롭다운 자체를 비활성**하고 사유(관리자 0명 방지)를 툴팁과 본문에 같이 적었다. API는 "강등만" 막지만 화면은 더 좁게 잠근다 — 승격도 본인이 스스로 할 일은 아니라서
- 등급 안내(무엇이 열리는지)를 목록 아래에 두어 드롭다운을 고르기 전에 보이게 했다

### 결정 (작업 문서에 없던 지점)

- **게이트는 `ready`(세션 복원) 전에는 아무것도 렌더하지 않는다** — localStorage에서 유저를 읽기 전 한 프레임 동안 "권한 없음"이 번쩍이는 걸 막기 위해서
- 안내 화면 문구는 `<b>` 같은 중첩 없이 한 문장 = 한 텍스트 노드로 적었다. 테스트가 `필요 등급: 관리자`처럼 통째로 질의할 수 있게 하려는 목적
- 멤버 목록의 `isSelf`는 API가 준 값을 그대로 믿는다 (M5-3에서 서버가 판정)

### 테스트

- 프론트 22건 추가(전체 45): `grade-matrix.test.tsx` 17건 — 등급 4종 × (탭 3종 · 요청 폼 · 승인 버튼 · 보드 화면 · 멤버 화면) 전수 + **노출 표가 `CORP_PERMISSIONS`와 같은 답을 내는지** 검증, `members.test.tsx` 5건 — 목록·등급 변경 페이로드(`{ grade }`)·본인 행 잠금·서버 거절 표시·권한 없음 안내
- shared 단위 2건 — `minimumGradeFor` (권한별 최저 등급 + "최저 등급 이상은 모두 갖는다" 누적성)
- 백엔드는 M5-3 매트릭스 그대로 (신규 엔드포인트 없음)
