# M1-7 — 문의 + 사고 접수(모의)

- 마일스톤: M1 (이용 플로우 완성) · 규모 M
- 상태: ☐ 대기
- 의존: M1-2

## 목적

피드백 #9 "차량에 대해서 문의하는 기능과 보험관련 연계 기능". 문의 접수와, 가입한 면책상품 정보를 보여주는 사고 접수(모의) 플로우를 만든다. 실제 보험사 청구 연동은 스코프 아웃 유지(Q5).

## 작업 내용

- [ ] **API** (`apps/api/src/inquiries/` 신규 모듈):
  - `POST /inquiries` — category(`VEHICLE`(차량 상태)/`USAGE`(이용 문의)/`ETC`) · body · vehicleId?/rentalId? 연결
  - `GET /me/inquiries` — 내 문의 목록(상태·답변 포함). 답변 기능은 백오피스 M3-5
- [ ] **API** — `POST /rentals/:id/incident` (rentals 모듈):
  - 상황 설명 + 사진(M1-2 재사용) → `IncidentReport` 저장
  - 응답에 해당 예약의 면책상품 티어·자기부담금(`INSURANCE_META`)·모의 보험사 안내 포함
- [ ] **웹**:
  - 문의 작성 폼(카테고리·본문) + 내 문의 목록 — 마이페이지 성격의 진입점(AppShell 또는 예약 상세)
  - 사고 접수 플로우: 이용 중 예약 상세에서 "사고 접수" → 설명+촬영 → 접수 완료 화면에 면책/자기부담금 안내

## 산출물

- inquiries 모듈(신규) · rentals `incident` 액션 · 문의/사고 UI · shared 스키마

## 완료 기준

- 문의 접수 → 내 목록에 OPEN 상태로 표시
- 사고 접수 완료 화면에 가입 면책상품과 자기부담금 금액이 정확히 노출 (통합 테스트로 검증)

## 테스트

- **백엔드(통합)**: 문의 생성→내 목록 조회 · incident 응답에 가입 면책 티어·자기부담금 포함 검증 · 타인 rental에 접수 403
- **프론트(MSW)**: 문의 폼 제출→목록 갱신 · 사고 접수 완료 화면에 면책 정보 렌더 · 필수 입력 검증 에러 표시

## 참고

- [project-review.md](../project-review.md) §5.2 · `INSURANCE_META`(packages/shared/src/schemas/reservation.ts)
