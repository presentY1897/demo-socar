# M1-3 — 체크인/체크아웃 API + 예약 상세 단계형 UI

- 마일스톤: M1 (이용 플로우 완성) · 규모 L
- 상태: ☑ 완료
- 의존: M1-2

## 목적

피드백 #9 "대여 시 상태 기입+촬영, 반납 시 주차 위치 촬영이 없다". 대여 개시~반납 사이에 실제 앱의 확인 절차를 넣고, 예약 상세를 단계형 흐름으로 재편한다.

## 작업 내용

- [x] **API** (`apps/api/src/rentals/`):
  - `POST /rentals/:id/check-in` — 차량 상태 메모 + 사진(PhotoCapture 산출) → `ConditionReport(CHECK_IN)` 저장. IN_USE 상태에서만, 중복 제출 409
  - `POST /rentals/:id/check-out` — 주차 위치 사진 + 층/구역 메모 → `ConditionReport(CHECK_OUT)` 저장
  - 게이트 규칙: 체크인 없으면 `control`(M1-4) 403 / 체크아웃 없으면 `return` 409 (메시지에 사유)
- [x] **웹** (`apps/web/src/app/reservations/[id]/page.tsx`): 단계형 UI 개편 —
  대여 개시 → ① 체크인(촬영+메모) → ② 스마트키 패널(M1-4 자리) + 매뉴얼 링크(M1-6 자리) → ③ 이용 중(연장 기존 기능) → ④ 체크아웃(주차 촬영+메모) → ⑤ 반납·정산 결과. 현재 단계 강조, 완료 단계 접힘
- [x] 제출된 체크인/아웃 리포트를 예약 상세에서 다시 볼 수 있게 (사진 썸네일 포함)

## 산출물

- rentals controller/service 확장 · 예약 상세 페이지 개편 · shared에 check-in/out 스키마

## 완료 기준

- 통합 테스트: 체크인 없이 control → 403 / 체크아웃 없이 return → 409 / 정상 순서 완주
- 로컬 브라우저에서 단계형 동선 1회 완주 (사진 포함)

## 테스트

- **백엔드(통합)**: 체크인 없이 control → 403 · 체크아웃 없이 return → 409 · 중복 체크인 → 409 · 정상 순서 완주
- **프론트(MSW)**: 단계형 UI — 대여 상태별로 올바른 단계 렌더 · 체크인 제출 성공 시 다음 단계 전환 · 제출 실패(MSW 4xx) 시 에러 표시

## 결과 (2026-09-01)

### 엔드포인트

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/rentals/:id/check-in` | `{ notes?, photos[1..5] }` | `ConditionReport`(사진은 `data:` URI) |
| POST | `/rentals/:id/check-out` | `{ notes?, parkingNote, photos[1..5] }` | 〃 |
| GET | `/rentals/:id/usage` | — | `{ rentalId, checkIn \| null, checkOut \| null }` |

게이트: 체크인 없이 체크아웃 → 409 · 체크아웃 없이 `return` → 409 · 중복 제출 → 409 · 남의 대여 → 403 ·
사진 0장/주차 위치 공백/jpeg 아닌 mime → 400. 스마트키(`control`) 게이트는 M1-4에서 같은 체크인 보고를 본다.

### 열린 질문 해소 — ConditionReport "단계별 1건"은 **DB 유니크가 아니라 API 정책**으로 둔다

- M1의 마이그레이션은 M1-1 한 건으로 닫혔다. 유니크 제약을 넣으려면 마이그레이션이 하나 더 필요한데,
  그 대가로 얻는 건 이미 API가 막고 있는 규칙의 이중화뿐이다
- 재제출(사진을 잘못 찍음·운영자 대리 등록)을 나중에 열어줄 여지를 남긴다. DB 유니크는 그 순간 또 마이그레이션을 강제한다
- 그래서 **조회는 처음부터 "단계별 최신 1건"**(`orderBy: createdAt desc`)을 유효 보고로 본다.
  재제출을 허용하기로 해도 `latestReport`는 그대로고 controller의 409만 걷어내면 된다
- 현재 정책: **재제출 불가(409)**. 잘못 올린 사진은 운영 문의(M1-7)로 처리한다

### UI

- 예약 상세를 5단계 카드로 재편: ① 체크인 → ② 스마트키·매뉴얼(M1-4/M1-6 자리) → ③ 이용 중(연장) → ④ 체크아웃 → ⑤ 반납·정산
- 현재 단계는 링으로 강조하고 펼침, 완료 단계는 요약만 남기고 접힘(눌러서 다시 펼치면 제출한 사진을 다시 본다), 잠긴 단계는 흐림 + 헤더 비활성
- 단계 판정 소스는 `GET /rentals/:id/usage` 하나 — 화면이 상태를 추측하지 않는다

### 테스트

- 백엔드 통합 5건(정상 완주 · 체크아웃 없이 반납 409 · 체크인 없이 체크아웃/중복 409 · 타인 403 · 검증 400) — `test/checkin-checkout.int-spec.ts`
- 프론트 6건(단계 렌더 · 체크인 페이로드 · 서버 4xx 표시 · shared 검증 에러 · 체크아웃 필수값/페이로드 · 완료 단계 펼쳐 보기) — `src/app/__tests__/reservation-detail.test.tsx`
- 회귀: 반납이 체크아웃을 요구하게 되어 `lifecycle.int-spec.ts`의 반납 두 곳에 체크인/체크아웃 단계를 추가
- 테스트 기반: Next 15의 `params`(Promise)를 jsdom에서 풀기 위한 `routeParams()` 헬퍼를 `test/utils.tsx`에 추가

## 참고

- [project-review.md](../project-review.md) §5.2 · M1-4(스마트키)·M1-6(매뉴얼)이 이 UI 골격 위에 올라감
