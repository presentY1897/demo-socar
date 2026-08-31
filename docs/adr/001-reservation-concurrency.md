# ADR-001. 예약 동시성 제어 — PostgreSQL EXCLUDE 제약을 최종 방어선으로

## 상황

카셰어링 예약의 본질적 제약: **같은 차량은 같은 시간에 한 명만 빌릴 수 있다.**
"조회해서 비어 있으면 INSERT"(check-then-insert)는 두 요청이 동시에 조회를 통과하면
둘 다 예약에 성공하는 레이스 컨디션이 생긴다. 인기 차량의 주말 슬롯처럼 동시 수요가
몰리는 지점에서 반드시 터지는 문제다.

## 검토한 대안

| 방식 | 장점 | 단점 |
|---|---|---|
| SELECT ... FOR UPDATE (차량 행 잠금) | 구현 단순 | 차량 단위 직렬화로 불필요한 대기, 잠금 누락 실수 여지 |
| Redis 분산 락 | DB 부하 분리 | 인프라 추가, 락 만료/장애 시 정합성 구멍, 데모 규모에 과함 |
| SERIALIZABLE 격리 수준 | 코드 변경 최소 | 재시도 로직 필수, 충돌 감지가 늦음(커밋 시점) |
| **EXCLUDE USING GIST 제약** | **DB가 겹침 자체를 원천 차단, 우회 불가** | 마이그레이션에 raw SQL 필요 (Prisma 미지원) |

## 결정

이중 방어:

1. **1차 (UX용)**: 트랜잭션 안에서 겹침을 조회해 겹치면 친절한 409 + 충돌 구간 반환
2. **2차 (정합성용)**: DB 제약이 레이스에서 살아남은 요청을 차단

```sql
ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_no_overlap
  EXCLUDE USING GIST (
    "vehicleId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" IN ('CONFIRMED', 'IN_USE'));
```

- `[)` 반개구간이라 10:00~12:00 반납과 12:00~14:00 시작이 자연스럽게 공존한다
- `WHERE`로 취소/완료 예약은 슬롯을 점유하지 않는다
- 애플리케이션 코드가 어떤 경로로 INSERT하든(일반 예약, 법인 배차 승인) 제약을 우회할 수 없다

## 결과

- 통합 테스트: 동시 요청 10건 → 정확히 1건 성공, 9건 409 (`test/reservations.int-spec.ts`)
- 위반 시 PG 에러(23P01)를 서비스 계층에서 409로 변환, 배차 승인 충돌 시엔 후보를 재계산해
  담당자가 다시 선택하게 한다

## 트레이드오프

- Prisma가 exclusion constraint를 모델링하지 못해 마이그레이션 SQL을 직접 관리한다
- GiST 인덱스 유지 비용이 있지만 예약 테이블 규모에서 무시 가능하다
