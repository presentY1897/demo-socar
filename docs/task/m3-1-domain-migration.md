# M3-1 — 백오피스 도메인 마이그레이션

- 마일스톤: M3 (운영 백오피스 재설계) · 규모 M
- 상태: ☐ 대기
- 의존: M2 완료

## 목적

피드백 #5의 데이터 기반 — 차량 센서(텔레메트리), 주차장 계약, 차량 도입 비용/보험을 도메인으로 추가한다. M3의 스키마 변경을 이 작업으로 모은다.

## 작업 내용

- [ ] `VehicleTelemetry` — vehicleId(1:1) · fuelPct(EV는 batteryPct 의미) · odometerKm · doorLocked · engineOn · lat/lng · updatedAt. **M1-1의 Vehicle 임시 필드(doorLocked/engineOn)를 여기로 이관**하고 Vehicle에서 제거
- [ ] `ZoneContract` — zoneId(1:1) · isPaid(유·무료) · partnerName · monthlyFeeKrw · contractStart · contractEnd
- [ ] `VehicleFinance` — vehicleId(1:1) · acquisitionType(`PURCHASE`/`LEASE`) · acquisitionCostKrw?/monthlyLeaseKrw? · insurerName · insurancePremiumKrw(월) · insuranceExpiresAt
- [ ] 시드: 전 차량 텔레메트리 초기값 + 전 존 계약 정보(유·무료 섞어서) + 전 차량 도입/보험 데이터. **경고 데모용 케이스 포함**: 연료 15% 미만 1대, 보험 만기 30일 내 1대, 계약 만료 30일 내 1존. `SEED_VERSION +1`
- [ ] 마이그레이션 1건 생성 (Vehicle 필드 이관 데이터 마이그레이션 포함)

## 산출물

- schema.prisma · 마이그레이션 · 시드 갱신

## 완료 기준

- migrate + seed 통과 · M1-4 스마트키가 이관된 텔레메트리 필드로 정상 동작(회귀 테스트)

## 테스트

- **백엔드**: 필드 이관 후 스마트키(M1-4) 통합 테스트 회귀 · 시드 경고 케이스(연료 부족/보험 만기/계약 만료) 존재 검증 1건
- **프론트**: 해당 없음

## 참고

- [project-review.md](../project-review.md) §5.4 신규 도메인 표
