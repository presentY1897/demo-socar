# M5-5 — 법인 플릿/리스 관리

- 마일스톤: M5 (MOCAR 비즈니스) · 규모 L
- 상태: ☐ 대기
- 의존: M5-2, M5-3

## 목적

3차 피드백의 본론 — "법인 차량의 리스도 관리하는 서비스". 법인 MANAGER가 자기 플릿(리스 차량)의 계약·비용·이용 현황을 관리한다.

## 작업 내용

- [ ] **API (biz, `manageFleet` 권한)**:
  - `GET /biz/fleet` — 법인 차량 목록: 리스 계약 상태·월 리스료·만기 D-day·최근 30일 이용률(배차 기록 집계)·현재 배정 존
  - `GET /biz/fleet/:id` — 차량 상세: 계약 이력 · 운행일지(기존 FMS 자동 기록 활용) · 이용 임직원 통계
  - `POST /biz/leases/:id/extend-request` / `terminate-request` — 리스 연장/해지 요청(모의 워크플로): 계약 status 전환 → 운영 어드민 처리 대기
  - `GET /biz/leases` — 계약 목록/상태
- [ ] **ops 대응 (운영 어드민 측)**:
  - `GET /ops/leases` · `POST /ops/leases/:id/approve|reject` — 연장/해지 요청 처리(승인 시 endAt 연장 또는 계약 종료+차량 회수 REPOSITION 작업 생성(M2 연계, M2 미완이면 상태 변경만))
  - 화면은 M3 완료 상태면 백오피스 탭에 소섹션, 아니면 최소 목록 페이지
- [ ] **화면 (`/biz/fleet`)**:
  - 차량 카드/표: 모델·번호판·리스 만기 D-day(임박 강조)·월 리스료·이용률
  - 차량 상세: 계약 정보 + 연장/해지 요청 버튼(진행 중 요청 상태 표시) + 운행일지 목록
  - 계약 합계: 월 총 리스 비용 요약

## 산출물

- biz fleet/leases controller·service · ops leases 처리 API · /biz/fleet 화면

## 테스트

- **백엔드(통합)**: 연장 요청→승인→endAt 연장 · 해지 요청→승인→계약 ENDED · 진행 중 요청 중복 400 · manageFleet 없는 등급 403 · 타 법인 플릿 403
- **프론트(MSW)**: 플릿 목록 렌더(만기 D-day 강조) · 연장/해지 요청 흐름(버튼→요청 상태 표시) · 요청 페이로드 검증

## 완료 기준

- MANAGER 계정으로: 플릿 목록 → 계약 확인 → 연장 요청 → (ops 승인) → 만기 연장 반영까지 완주

## 참고

- [m5-1](m5-1-corp-grade-domain.md) LeaseContract · M3 회계와의 관계: 리스료는 MOCAR 매출 — M3 완료 시 회계 요약에 합산
