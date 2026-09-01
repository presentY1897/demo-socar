# M3-3 — /ops API

- 마일스톤: M3 (운영 백오피스 재설계) · 규모 L
- 상태: ☐ 대기
- 의존: M3-2

## 목적

운영 센터 화면(M3-4~6)이 쓸 백엔드 전체. 기존 `/metrics`(매출 중심)는 회계 전용으로 강등한다.

## 작업 내용

- [ ] **Fleet**: `GET /ops/fleet` — 전 차량: 상태(대기/운행/탁송/정비), 배정 존, 텔레메트리 요약(연료·주행거리), 다음 예약, 보험 만기 D-day / `GET /ops/fleet/:id` — 센서 상세 + 스마트키 조작 이력(VehicleControlLog) + 도입/보험(VehicleFinance) + 정비 메모
- [ ] **차량 등록**: `POST /ops/vehicles` — 차량 + 도입 정보(VehicleFinance) 동시 등록, 존 배정
- [ ] **존 계약**: `GET /ops/zones`(계약·면수·현재 배정 차량 수·잔여 자리) · `PATCH /ops/zones/:id/contract`
- [ ] **유저 리스크**: `GET /ops/users/risk` — 유저별 지연 반납 횟수(30일)·사고 접수 수·결제 거절 수 집계, 임계치 초과만
- [ ] **문의 답변**: `GET /ops/inquiries` · `POST /ops/inquiries/:id/answer` (M1-7 연계)
- [ ] **회계**: `GET /ops/accounting/summary` — 매출(기존 metrics 재사용) + 비용(월 리스료+보험료+주차장 계약비 합산) → 월 손익. 기존 `/metrics/summary·daily`는 회계 탭 전용으로 유지
- [ ] **경고 피드**: `GET /ops/alerts` — 연료 부족(<20%)·보험 만기 임박(D-30)·계약 만료 임박(D-30)·지연 반납 진행 중
- [ ] 전 엔드포인트 OPS 역할 가드

## 산출물

- `apps/api/src/ops/` 하위 도메인별 컨트롤러/서비스 (fleet · zones · users · inquiries · accounting · alerts)

## 완료 기준

- 통합 테스트: 잔여 자리 계산 · 리스크 집계값 · 손익 합산 · 비 OPS 접근 403 · 경고 4종이 시드 데이터로 각 1건 이상 검출

## 테스트

- **백엔드(통합)**: 잔여 자리 계산 · 리스크 집계값 · 손익 합산 · 경고 4종 각 1건 이상 검출(시드 기준) · 비 OPS 접근 403 전 엔드포인트
- **프론트**: 해당 없음 (화면은 M3-4~6)

## 참고

- [project-review.md](../project-review.md) §5.4 · M2-4에서 만든 `/ops/tasks`와 같은 모듈 체계
