# M2-2 — 핸들러 작업 자동 생성

- 마일스톤: M2 (핸들러 시스템) · 규모 S
- 상태: ☐ 대기
- 의존: M2-1

## 목적

부름 예약의 생명주기에 맞춰 핸들러 작업이 자동으로 생기게 한다 — 예약이 사람의 작업으로 이어지는 연결 고리.

## 작업 내용

- [ ] 부름 예약 결제 완료(reservations.create 성공) 시 → `DELIVERY` 작업 생성:
  - fromZoneId = 차량의 그 시각 유효 존(위치 체인), 목적지 = delivery 좌표/라벨
  - dueAt = 이용 시작 − 리드타임 60분 (탁송 이동 시간은 ADR-006 판정에서 이미 보장됨)
- [ ] 부름 이용 반납(정산 완료) 시 → `RETRIEVE` 작업 생성 (수령지 → 원래 존, 제자리 회수 정책)
- [ ] 예약 취소 시 연결된 PENDING/ASSIGNED 작업 `CANCELED` 처리
- [ ] 같은 트랜잭션 경계 안에서 생성 (예약은 성공했는데 작업이 없는 상태 방지)

## 산출물

- reservations/rentals service에 작업 생성 훅 · handler-tasks service(신규 모듈의 일부)

## 완료 기준

- 통합 테스트: ① 부름 예약 → DELIVERY 생성(dueAt 검증) ② 부름 반납 → RETRIEVE 생성 ③ 취소 → 작업 CANCELED

## 테스트

- **백엔드(통합)**: 부름 예약 → DELIVERY 생성(dueAt = 시작−60분 검증) · 부름 반납 → RETRIEVE 생성 · 예약 취소 → 작업 CANCELED · 일반(비부름) 예약은 작업 미생성
- **프론트**: 해당 없음

## 참고

- [ADR-006](../adr/006-bureum-delivery.md) — 부름 가용성 판정과 리드타임
