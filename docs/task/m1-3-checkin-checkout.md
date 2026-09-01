# M1-3 — 체크인/체크아웃 API + 예약 상세 단계형 UI

- 마일스톤: M1 (이용 플로우 완성) · 규모 L
- 상태: ☐ 대기
- 의존: M1-2

## 목적

피드백 #9 "대여 시 상태 기입+촬영, 반납 시 주차 위치 촬영이 없다". 대여 개시~반납 사이에 실제 앱의 확인 절차를 넣고, 예약 상세를 단계형 흐름으로 재편한다.

## 작업 내용

- [ ] **API** (`apps/api/src/rentals/`):
  - `POST /rentals/:id/check-in` — 차량 상태 메모 + 사진(PhotoCapture 산출) → `ConditionReport(CHECK_IN)` 저장. IN_USE 상태에서만, 중복 제출 409
  - `POST /rentals/:id/check-out` — 주차 위치 사진 + 층/구역 메모 → `ConditionReport(CHECK_OUT)` 저장
  - 게이트 규칙: 체크인 없으면 `control`(M1-4) 403 / 체크아웃 없으면 `return` 409 (메시지에 사유)
- [ ] **웹** (`apps/web/src/app/reservations/[id]/page.tsx`): 단계형 UI 개편 —
  대여 개시 → ① 체크인(촬영+메모) → ② 스마트키 패널(M1-4 자리) + 매뉴얼 링크(M1-6 자리) → ③ 이용 중(연장 기존 기능) → ④ 체크아웃(주차 촬영+메모) → ⑤ 반납·정산 결과. 현재 단계 강조, 완료 단계 접힘
- [ ] 제출된 체크인/아웃 리포트를 예약 상세에서 다시 볼 수 있게 (사진 썸네일 포함)

## 산출물

- rentals controller/service 확장 · 예약 상세 페이지 개편 · shared에 check-in/out 스키마

## 완료 기준

- 통합 테스트: 체크인 없이 control → 403 / 체크아웃 없이 return → 409 / 정상 순서 완주
- 로컬 브라우저에서 단계형 동선 1회 완주 (사진 포함)

## 테스트

- **백엔드(통합)**: 체크인 없이 control → 403 · 체크아웃 없이 return → 409 · 중복 체크인 → 409 · 정상 순서 완주
- **프론트(MSW)**: 단계형 UI — 대여 상태별로 올바른 단계 렌더 · 체크인 제출 성공 시 다음 단계 전환 · 제출 실패(MSW 4xx) 시 에러 표시

## 참고

- [project-review.md](../project-review.md) §5.2 · M1-4(스마트키)·M1-6(매뉴얼)이 이 UI 골격 위에 올라감
