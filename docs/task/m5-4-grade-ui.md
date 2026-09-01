# M5-4 — 등급 관리 UI + 등급별 화면 분기

- 마일스톤: M5 (MOCAR 비즈니스) · 규모 M
- 상태: ☐ 대기
- 의존: M5-3

## 목적

MANAGER가 화면에서 등급을 부여하고, 각 등급은 자기 권한만큼만 보고 조작할 수 있게 한다. 전부 `/biz` 영역 기준.

## 작업 내용

- [ ] **멤버 관리 탭** (`/biz/members`, MANAGER 전용):
  - 법인 멤버 목록(이름·이메일·등급) + 등급 변경 드롭다운(`PATCH /biz/members/:id/grade`)
  - 자기 자신 행은 등급 변경 비활성 + 사유 툴팁
- [ ] **등급별 화면 분기** — shared `CORP_PERMISSIONS`로 판정 (API 가드와 동일 소스):
  - VIEWER: 요청 생성 폼·승인 버튼 숨김 — 현황 조회만
  - REQUESTER: 생성 가능, 승인 UI 숨김
  - APPROVER: 승인/반려 + 타임라인 보드
  - MANAGER: + 멤버 관리·플릿/리스(M5-5) 탭 노출
- [ ] 권한 없는 URL 직접 접근(예: VIEWER가 /biz/board) 시 안내 화면 (403 처리)
- [ ] BizShell 내비를 등급 반영으로

## 산출물

- /biz/members 탭 · biz 화면 등급 분기 · 세션 훅에 corpGrade

## 테스트

- **백엔드**: 해당 없음 (M5-3에서 완료)
- **프론트(MSW)**: 등급 4종 세션 목킹으로 분기 전수 — 등급별 버튼/탭 노출·숨김 · VIEWER의 board 접근 안내 화면 · 등급 변경 요청 페이로드 검증

## 완료 기준

- viewer/member/admin 계정 로그인 시 화면이 권한대로 다르게 보임 · MANAGER 등급 변경 → 대상 계정 재로그인 시 반영

## 참고

- [m5-3](m5-3-permission-guards.md) · UI 분기와 API 가드는 같은 상수 사용이 원칙
