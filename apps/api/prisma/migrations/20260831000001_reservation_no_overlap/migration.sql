-- 예약 시간 겹침 방지의 최종 방어선.
-- 애플리케이션의 사전 검사(check-then-insert)는 동시 요청 레이스에서 뚫릴 수 있으므로,
-- PostgreSQL EXCLUDE USING GIST 제약으로 "같은 차량 + 시간범위 겹침"을 DB 레벨에서 차단한다.
-- 취소/완료된 예약은 슬롯을 점유하지 않도록 WHERE로 제외한다.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
  ADD CONSTRAINT reservation_no_overlap
  EXCLUDE USING GIST (
    "vehicleId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" IN ('CONFIRMED', 'IN_USE'));
