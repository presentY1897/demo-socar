# M2-2 — 핸들러 작업 자동 생성

- 마일스톤: M2 (핸들러 시스템) · 규모 S
- 상태: ☑ 완료
- 의존: M2-1

## 목적

부름 예약의 생명주기에 맞춰 핸들러 작업이 자동으로 생기게 한다 — 예약이 사람의 작업으로 이어지는 연결 고리.

## 작업 내용

- [x] 부름 예약 결제 완료(reservations.create 성공) 시 → `DELIVERY` 작업 생성:
  - fromZoneId = 차량의 그 시각 유효 존(위치 체인), 목적지 = delivery 좌표/라벨
  - dueAt = 이용 시작 − 리드타임 60분 (탁송 이동 시간은 ADR-006 판정에서 이미 보장됨)
- [x] 부름 이용 반납(정산 완료) 시 → `RETRIEVE` 작업 생성 (수령지 → 원래 존, 제자리 회수 정책)
- [x] 예약 취소 시 연결된 PENDING/ASSIGNED 작업 `CANCELED` 처리
- [x] 같은 트랜잭션 경계 안에서 생성 (예약은 성공했는데 작업이 없는 상태 방지)

## 산출물

- reservations/rentals service에 작업 생성 훅 · handler-tasks service(신규 모듈의 일부)

## 완료 기준

- 통합 테스트: ① 부름 예약 → DELIVERY 생성(dueAt 검증) ② 부름 반납 → RETRIEVE 생성 ③ 취소 → 작업 CANCELED

## 테스트

- **백엔드(통합)**: 부름 예약 → DELIVERY 생성(dueAt = 시작−60분 검증) · 부름 반납 → RETRIEVE 생성 · 예약 취소 → 작업 CANCELED · 일반(비부름) 예약은 작업 미생성
- **프론트**: 해당 없음

## 결과 (2026-09-01)

### 생성 트리거

| 이벤트 | 만드는 작업 | 출발 → 도착 | 기한(dueAt) |
|---|---|---|---|
| `POST /reservations` 성공 (부름) | `DELIVERY` | 시작 시각의 유효 존(위치 체인) → 수령지 좌표 | 이용 시작 − 60분 (`DELIVERY_MIN_LEAD_MINUTES`) |
| `POST /rentals/:id/return` 정산 완료 (부름) | `RETRIEVE` | 수령지 좌표 → 배달이 출발했던 존 | 반납 + 120분 (`HANDLER_RETRIEVE_DUE_MINUTES`) |
| `POST /reservations/:id/cancel` | 연결 작업 `CANCELED` | — | — |

편도·왕복 예약은 작업을 만들지 않는다 — 차를 옮기는 사람이 이용자 자신이다.

### 왜 이렇게 했나

- **예약과 같은 트랜잭션 안에서 만든다.** 결제는 끝났는데 배달 작업이 없으면 아무도 차를
  옮기지 않고, 그 사실을 알아챌 사람도 없다. 그래서 `HandlerTasksService`의 메서드는 전부
  트랜잭션 클라이언트를 받는다 (`Prisma.TransactionClient`)
- **회수의 "원래 존"은 배달 작업에서 읽는다.** 배달은 `vehicle.zoneId`를 바꾸지 않으므로
  차량의 현재 존과 같지만, 작업 기록에서 직접 읽으면 두 값이 어긋날 여지가 없다
- **회수 기한 상수를 새로 뒀다** (`HANDLER_RETRIEVE_DUE_MINUTES = 120`). 배달의 기한은
  "이용 시작"이라는 약속된 시각에서 거꾸로 잡히지만 회수는 뒤에 기다리는 사람이 없어
  기준 시각이 없다 — 무기한이면 차가 수령지에 방치되므로 반납 기준 여유 시간을 기한으로 삼았다
- **취소 정리 대상은 전이표에서 파생한다.** `PENDING`/`ASSIGNED`를 코드에 다시 적지 않고
  `canTransitionHandlerTask(s, 'CANCELED')`로 뽑는다. 이동을 시작한 작업(`EN_ROUTE`)은
  건드리지 않는다 — 차가 도로 위에 있는데 작업만 사라지면 차량 위치의 책임자가 없어진다
- 견적 결과에 `startZoneId`를 실어 배달 작업의 출발 존이 편도 수수료를 계산한 존과
  항상 같은 값이 되게 했다 (ADR-005 위치 체인과 단일 소스)

### 산출물

- `apps/api/src/handler/handler-tasks.service.ts` · `handler-tasks.module.ts` (신규)
- `reservations.service.ts` — 생성/취소 훅, `QuoteResult.startZoneId` 추가
- `rentals.service.ts` — 정산 완료 시 회수 작업 훅
- `packages/shared/src/schemas/handler-task.ts` — `HANDLER_RETRIEVE_DUE_MINUTES`

### 테스트

- 통합 4건 (`test/handler-task-autocreate.int-spec.ts`) — 배달 생성/기한 검증 ·
  이용 완주 후 회수 생성(수령지 → 원래 존, 차량 존은 아직 그대로) ·
  취소 시 대기/배정만 취소되고 이동 중 작업은 유지 · 왕복·편도는 무생성
- 회귀: 부름 통합 테스트의 정리 순서에 작업 삭제를 추가 (부름 예약이 이제 작업을 남긴다)

## 참고

- [ADR-006](../adr/006-bureum-delivery.md) — 부름 가용성 판정과 리드타임
