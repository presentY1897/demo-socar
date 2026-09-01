# M5-5 — 법인 플릿/리스 관리

- 마일스톤: M5 (MOCAR 비즈니스) · 규모 L
- 상태: ☑ 완료
- 의존: M5-2, M5-3

## 목적

3차 피드백의 본론 — "법인 차량의 리스도 관리하는 서비스". 법인 MANAGER가 자기 플릿(리스 차량)의 계약·비용·이용 현황을 관리한다.

## 작업 내용

- [x] **API (biz, `manageFleet` 권한)**:
  - `GET /biz/fleet` — 법인 차량 목록: 리스 계약 상태·월 리스료·만기 D-day·최근 30일 이용률(배차 기록 집계)·현재 배정 존
  - `GET /biz/fleet/:id` — 차량 상세: 계약 이력 · 운행일지(기존 FMS 자동 기록 활용) · 이용 임직원 통계
  - `POST /biz/leases/:id/extend-request` / `terminate-request` — 리스 연장/해지 요청(모의 워크플로): 계약 status 전환 → 운영 어드민 처리 대기
  - `GET /biz/leases` — 계약 목록/상태
- [x] **ops 대응 (운영 어드민 측)**:
  - `GET /ops/leases` · `POST /ops/leases/:id/approve|reject` — 연장/해지 요청 처리(승인 시 endAt 연장 또는 계약 종료+차량 회수 REPOSITION 작업 생성(M2 연계, M2 미완이면 상태 변경만))
  - 화면은 M3 완료 상태면 백오피스 탭에 소섹션, 아니면 최소 목록 페이지
- [x] **화면 (`/biz/fleet`)**:
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

## 구현 메모 (2026-09-01)

### 엔드포인트

| 엔드포인트 | 요구 권한 | 허용 |
|---|---|---|
| `GET /biz/fleet` · `GET /biz/fleet/:id` | `manageFleet` | MANAGER |
| `GET /biz/leases` | `manageFleet` | MANAGER |
| `POST /biz/leases/:id/extend-request` · `/terminate-request` | `manageFleet` | MANAGER |
| `GET /ops/leases` · `POST /ops/leases/:id/approve` · `/reject` | 전역 역할 `OPS_ADMIN` | 운영 어드민 |

`/biz/fleet/:id`의 `:id`는 **차량 id**, `/biz/leases/:id`의 `:id`는 **계약 id**다.

### 상태 전이 (누가 어떤 상태를 만드는가)

```
            ┌────────── biz(MANAGER) ──────────┐   ┌──── ops(OPS_ADMIN) ────┐
ACTIVE ─연장 요청→ EXTENSION_REQUESTED ─승인→ ACTIVE (endAt := requestedEndAt)
                                        └반려→ ACTIVE (requestNote := "반려: …")
ACTIVE ─해지 요청→ TERMINATION_REQUESTED ─승인→ ENDED (endedAt := now)
                                          └반려→ ACTIVE
ENDED  ─(요청 불가, 409)
```

- 법인은 `*_REQUESTED`만, 운영은 `ACTIVE`/`ENDED`만 만든다 — 법인이 스스로 만기를 옮길 수 있으면 계약이 아니게 되므로
- 처리 대기 중 재요청 · 종료된 계약 재요청 · 이미 처리된 요청 재처리는 모두 **409**
- 해지 승인 시 **차량 회수(REPOSITION) 작업 생성은 M2 완료 후**. 지금은 계약 상태만 바꾸고 차량 배정(`Vehicle.corporationId`)은 건드리지 않는다 — 즉시 회수하면 이미 잡힌 배차/예약이 깨진다

### 계산 (shared `corp/lease.ts` — 단위 테스트 13건)

- `leaseDDay(endAt, now)` — **KST 달력 날짜** 차이. 오늘 23:00 만기와 내일 01:00 만기는 2시간 차이지만 D-0 / D-1로 갈려야 사람 감각과 맞는다
- `isLeaseExpiringSoon` / `LEASE_EXPIRY_WARNING_DAYS = 30` — API가 `dDay`·`expiringSoon`을 계산해 내려주고 화면은 그 값만 쓴다 (임계값이 두 군데로 갈리지 않게)
- `summarizeUsage(trips, windowDays)` — 이용률 = **이용한 날 수 / 집계 창(30일)**. 시간(24h × 30일) 분모로 잡으면 정상 운영 차량도 한 자릿수 %가 나와 화면에서 의미를 잃는다. 자정을 넘긴 운행은 이틀로 센다

### 결정 (작업 문서에 없던 지점)

- **중복 요청은 400이 아니라 409**로 냈다 (문서엔 400). "상태가 맞지 않아 처리할 수 없음"은 전부 409로 통일 — ops의 재처리(409)와 같은 성격이라 코드를 나눌 이유가 없다
- **반려 사유는 `requestNote`에 `반려: …`로 남긴다.** 전용 컬럼을 추가하려면 마이그레이션이 필요한데 M5는 마이그레이션 1건으로 끝내기로 한 터라, 계약의 "최근 메모" 필드로 재사용했다
- **ops 응답 매핑을 biz와 공유하지 않는다** — 계산(D-day)은 shared를 쓰되 DTO 조립은 각 컨텍스트가 자기 것을 갖는다. 두 컨텍스트를 떼어낼 때 잘라내는 선이라서
- **`/ops/leases` 화면은 소비자 셸의 최소 목록 페이지**로 냈다 (M3 백오피스 미완). AppShell 하단 탭에 운영 어드민 전용 '리스' 탭을 추가했고, M3가 붙으면 백오피스 탭의 소섹션으로 옮긴다
- **동적 라우트 화면(`/biz/fleet/[id]`)은 `useParams()`를 쓴다** — 기존 소비자 화면(`book/[vehicleId]`)의 `use(params)` 규약과 다르다. React 19가 클라이언트에서 만든 프로미스를 `use`로 못 받아 테스트에서 화면 전체가 서스펜드되기 때문. 테스트 유틸에 `params` 옵션을 추가하고 규칙을 `src/test/README.md`에 적었다

### 테스트

- **백엔드 통합 23건** (`test/biz-fleet-lease.int-spec.ts`): 등급 4종 × (플릿·리스 조회 / 연장·해지 요청) 권한 전수 · 법인↔운영 상호 403 · 타 법인 차량/계약 403 · 연장 요청→승인(endAt 이동)·반려 · 해지 요청→승인(ENDED) · 중복/종료/재처리 409 · 희망 만기 역전 400 · 목록 합계·D-day·이용률·운행일지·임직원 통계
  - 시드 계약을 바꾸면 `corp-lease` 스위트의 전제가 깨지므로, 상태를 바꾸는 검증은 이 스위트가 만든 법인·차량·계약에서만 한다
- **프론트 20건**: `/biz/fleet` 목록(합계·D-12 강조·처리 대기 배지·이용률) · 상세(계약·운행일지·임직원 통계·이력) · 연장 요청 페이로드(ISO 변환) · 해지 확인/취소 · 처리 대기 중 버튼 잠금 · 409 표시 · 등급 게이트 / `/ops/leases` 승인·반려 페이로드 · 사유 취소 · 409 표시 · 비운영 계정 안내
- **shared 단위 13건**: D-day(KST 경계·만기 지남) · 이용률(같은 날 2회·자정 넘김·0건) · 상태 라벨 · 요청 DTO 스키마
