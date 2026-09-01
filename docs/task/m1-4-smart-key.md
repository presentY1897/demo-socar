# M1-4 — 가상 스마트키

- 마일스톤: M1 (이용 플로우 완성) · 규모 M
- 상태: ☐ 대기
- 의존: M1-3

## 목적

피드백 #9 "가상으로 리모컨 연계해서 차량을 열고 시동을 거는 기능". **시동 포함으로 확정**(Q3, 2026-09-01).

## 작업 내용

- [ ] **API** — `POST /rentals/:id/control` {action}:
  - action: `UNLOCK` / `LOCK` / `HAZARD` / `HORN` / `IGNITION_ON` / `IGNITION_OFF`
  - 허용 조건: 해당 rental이 IN_USE + 본인 소유 + 체크인 완료(M1-3 게이트). 위반 시 403
  - 처리: `VehicleControlLog` 기록 + `Vehicle.doorLocked`/`engineOn` 갱신 (M3에서 텔레메트리로 통합)
  - 상태 규칙: 시동 ON 상태에서 LOCK 불가(400) 등 최소한의 정합성
- [ ] **웹** — 예약 상세 ② 단계에 리모컨형 스마트키 패널:
  - 현재 상태 표시(잠김/열림, 시동 ON/OFF) + 버튼 6종, 조작 시 낙관적 갱신 + 실패 롤백
  - HAZARD/HORN은 시각 피드백만 (토스트 "비상등을 켰어요" 등)

## 산출물

- rentals controller/service `control` 액션 · shared action 스키마 · 스마트키 패널 컴포넌트

## 완료 기준

- 통합 테스트: 대여 외 상태 403 · 체크인 전 403 · 시동 ON 중 LOCK 400 · 정상 조작 시 로그 적재
- 패널에서 잠금 토글이 상태 표시에 반영됨

## 테스트

- **백엔드(통합)**: 대여 외 403 · 체크인 전 403 · 시동 ON 중 LOCK 400 · 정상 조작 시 ControlLog 적재·상태 갱신
- **프론트(MSW)**: 스마트키 패널 — 버튼 클릭 → 상태 표시 갱신(낙관적) · MSW 실패 응답 시 롤백·토스트 · 액션별 올바른 페이로드 전송

## 참고

- [project-review.md](../project-review.md) §5.2 · 실물 쏘카 스마트키는 시동 미포함이지만 데모 효과를 위해 포함하기로 결정 — ADR-007(M1-8)에 이 선택을 기록
