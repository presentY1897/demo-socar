# M2-1 — 핸들러 도메인 + 데모 계정

- 마일스톤: M2 (핸들러 시스템) · 규모 M
- 상태: ☐ 대기
- 의존: M1 완료

## 목적

피드백 #7 "운송기사용 페이지". 실제 쏘카에서 부름 배달·회수·재배치를 수행하는 '핸들러' 역할의 도메인 기반을 만든다. M2의 스키마 변경을 이 작업으로 모은다.

## 작업 내용

- [ ] `Role` enum에 `HANDLER` 추가
- [ ] `HandlerTask` 모델:
  - type: `DELIVERY`(부름 배달) / `RETRIEVE`(회수) / `REPOSITION`(재배치)
  - status: `PENDING`(대기) → `ASSIGNED`(배정) → `EN_ROUTE`(이동 중) → `DONE`(완료), `CANCELED`
  - reservationId? · vehicleId · fromZoneId · 목적지(toZoneId? 또는 toLat/toLng — 부름은 좌표) · assigneeId?(HANDLER) · dueAt · 완료 사진/메모(M1-2 사진 패턴)
- [ ] 시드: 데모 계정 `handler@demo.mocar.kr`(비밀번호 demo1234) + 샘플 작업 2~3건, `SEED_VERSION +1`
- [ ] 마이그레이션 1건 생성

## 산출물

- schema.prisma · 마이그레이션 · 시드 갱신

## 완료 기준

- migrate + seed 통과, 핸들러 계정 로그인 가능 (화면은 M2-5)

## 테스트

- **백엔드**: 마이그레이션/시드 회귀 + 핸들러 계정 로그인·역할 확인 통합 1건
- **프론트**: 해당 없음

## 참고

- [project-review.md](../project-review.md) §5.3 · 부름 리드타임 60분 상수([ADR-006](../adr/006-bureum-delivery.md))
