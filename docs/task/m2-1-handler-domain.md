# M2-1 — 핸들러 도메인 + 데모 계정

- 마일스톤: M2 (핸들러 시스템) · 규모 M
- 상태: ☑ 완료
- 의존: M1 완료

## 목적

피드백 #7 "운송기사용 페이지". 실제 쏘카에서 부름 배달·회수·재배치를 수행하는 '핸들러' 역할의 도메인 기반을 만든다. M2의 스키마 변경을 이 작업으로 모은다.

## 작업 내용

- [x] `Role` enum에 `HANDLER` 추가
- [x] `HandlerTask` 모델:
  - type: `DELIVERY`(부름 배달) / `RETRIEVE`(회수) / `REPOSITION`(재배치)
  - status: `PENDING`(대기) → `ASSIGNED`(배정) → `EN_ROUTE`(이동 중) → `DONE`(완료), `CANCELED`
  - reservationId? · vehicleId · fromZoneId · 목적지(toZoneId? 또는 toLat/toLng — 부름은 좌표) · assigneeId?(HANDLER) · dueAt · 완료 사진/메모(M1-2 사진 패턴)
- [x] 시드: 데모 계정 `handler@demo.mocar.kr`(비밀번호 demo1234) + 샘플 작업 2~3건, `SEED_VERSION +1`
- [x] 마이그레이션 1건 생성

## 산출물

- schema.prisma · 마이그레이션 · 시드 갱신

## 완료 기준

- migrate + seed 통과, 핸들러 계정 로그인 가능 (화면은 M2-5)

## 테스트

- **백엔드**: 마이그레이션/시드 회귀 + 핸들러 계정 로그인·역할 확인 통합 1건
- **프론트**: 해당 없음


## 결과 (2026-09-01)

### 스키마 (마이그레이션 `20260901100253_handler_domain` 1건)

| 추가 | 내용 |
|---|---|
| `Role` | `HANDLER` — 핸들러(운송기사) |
| `HandlerTaskType` | `DELIVERY` / `RETRIEVE` / `REPOSITION` |
| `HandlerTaskStatus` | `PENDING` / `ASSIGNED` / `EN_ROUTE` / `DONE` / `CANCELED` |
| `HandlerTask` | 작업 1건 — 출발/도착·담당자·기한·완료 기록 |
| `HandlerTaskPhoto` | 인계 사진 (ConditionPhoto와 같은 압축 base64 규격, 작업 삭제 시 cascade) |

M2의 스키마 변경은 이 작업 하나로 모으는 규칙(work-plan 운영 규칙)에 따라
M2-2~M2-5가 쓸 컬럼까지 함께 넣었다.

- **출발도 좌표를 갖는다** — 작업 문서 초안은 `fromZoneId` + 목적지(존 또는 좌표)였지만,
  부름 회수는 출발이 "이용자가 세워 둔 수령지"라 좌표다. `fromLat/fromLng/fromLabel`을
  도착과 대칭으로 추가해 작업 카드·지도(M2-5)가 예약을 다시 조회하지 않고도
  "출발 → 도착"을 그릴 수 있게 했다. `fromZoneId`는 그대로 필수 — 회수·재배치가
  차를 되돌려 놓을 존이자 배정 추천(M2-4)의 거리 기준이다
- **시각 필드 4종**(`assignedAt`/`startedAt`/`completedAt`/`canceledAt`)은 전이의 흔적이다.
  M2-4의 배정 추천이 "마지막 완료 작업 위치"를 찾을 때, M2-5의 이력 탭이 오늘/이번 주를
  나눌 때 이 값들을 쓴다
- 인덱스: `(assigneeId, status, dueAt)` 핸들러 개인 큐 · `(status, dueAt)` 공개 작업/운영 목록 ·
  `(reservationId)` 예약 취소 시 연결 작업 정리 · `(vehicleId, dueAt)`

### 상태 전이 규칙 — `packages/shared/src/schemas/handler-task.ts`

전이 규칙을 API와 화면이 각자 들고 있으면 버튼은 눌리는데 서버가 거절하는 어긋남이
생긴다(스마트키 `control.ts`와 같은 이유). 규칙은 shared 한 벌만 둔다.

| 전이 | 만드는 주체 |
|---|---|
| `PENDING → ASSIGNED` | 핸들러 수락(`/handler/tasks/:id/accept`) 또는 운영자 배정(`/ops/tasks/:id/assign`) |
| `ASSIGNED → ASSIGNED` | 운영자 재배정 — 이동 시작 전에만 (담당자만 교체) |
| `ASSIGNED → EN_ROUTE` | 핸들러 이동 시작(`/handler/tasks/:id/start`) |
| `EN_ROUTE → DONE` | 핸들러 완료(`/handler/tasks/:id/complete`) — 인계 사진 + 메모 필수 |
| `PENDING/ASSIGNED → CANCELED` | 연결 예약 취소 시 자동 정리 (M2-2) |

`EN_ROUTE`에서는 취소하지 않는다 — 차를 옮기는 중에 작업만 사라지면 차량의 실제 위치를
아무도 책임지지 않게 된다. `DONE`·`CANCELED`는 종착.
지연 판정(`isHandlerTaskOverdue`)도 같은 파일에 둬서 목록(M2-3)과 경고 배지(M2-5)가 같은 기준을 본다.

### 시드 (`SEED_VERSION` 3 → 4)

- 데모 계정 추가: `handler@demo.mocar.kr` / demo1234 (한기사, `HANDLER`)
- 샘플 작업 3건 — 미배정 `DELIVERY`(3시간 뒤 시작하는 부름 예약, 기한 = 시작 −60분) ·
  핸들러에게 배정된 `RETRIEVE`(방금 끝난 부름 이용의 제자리 회수) · 미배정 `REPOSITION`(존 간 이동)
- 로그인 직후 "공개 작업 수락 → 내 작업 진행"이 바로 보이는 구성. 완료 이력은 데모에서
  직접 완주하며 쌓는다

### 테스트

- 통합 5건 — 데모 계정 로그인·역할·토큰 payload · 시드 샘플 작업 · 3타입 저장/기한순 조회와
  예약 역참조 · 수락→이동→완료 기록과 사진 cascade · `HANDLER`의 `/metrics/summary` 403(운영 어드민은 200)
  (`test/handler-domain.int-spec.ts`)
- 단위 8건 — 전이 매트릭스(정상·건너뛰기·역행·재배정·취소 범위·종착)와 지연 판정
  (`packages/shared/src/schemas/handler-task.spec.ts`)

### 남은 것

- README 데모 계정 표에 `handler@demo.mocar.kr` 행 추가 (M5 트랙과 같은 표를 고치게 되어 이 작업에서는 보류)

## 참고

- [project-review.md](../project-review.md) §5.3 · 부름 리드타임 60분 상수([ADR-006](../adr/006-bureum-delivery.md))
