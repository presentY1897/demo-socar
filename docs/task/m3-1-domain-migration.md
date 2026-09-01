# M3-1 — 백오피스 도메인 마이그레이션

- 마일스톤: M3 (운영 백오피스 재설계) · 규모 M
- 상태: ☑ 완료
- 의존: M2 완료

## 목적

피드백 #5의 데이터 기반 — 차량 센서(텔레메트리), 주차장 계약, 차량 도입 비용/보험을 도메인으로 추가한다. M3의 스키마 변경을 이 작업으로 모은다.

## 작업 내용

- [x] `VehicleTelemetry` — vehicleId(1:1 · PK) · fuelPct(EV는 batteryPct 의미) · odometerKm · doorLocked · engineOn · lat/lng · updatedAt. **M1-1의 Vehicle 임시 필드(doorLocked/engineOn)를 여기로 이관**하고 Vehicle에서 제거
- [x] `ZoneContract` — zoneId(1:1) · isPaid(유·무료) · partnerName · monthlyFeeKrw · contractStart · contractEnd
- [x] `VehicleFinance` — vehicleId(1:1) · acquisitionType(`PURCHASE`/`LEASE`) · acquisitionCostKrw?/monthlyLeaseKrw? · acquiredAt · insurerName · insurancePremiumKrw(월) · insuranceExpiresAt
- [x] 시드: 전 차량 텔레메트리 초기값 + 전 존 계약 정보(유·무료 섞어서) + 전 차량 도입/보험 데이터. **경고 데모용 케이스 포함**: 연료 12.4% 1대, 보험 만기 D-18 1대, 계약 만료 D-12 1존, 지연 반납 진행 중 1건. `SEED_VERSION 6 → 7`
- [x] 마이그레이션 1건 생성 (`20260901112500_m3_ops_domain` — Vehicle 필드 이관 데이터 마이그레이션 포함)

### M3 전체를 이 마이그레이션 하나로 모은 결과 (work-plan 운영 규칙)

M3-2·3은 물론 M3-4·5·6(화면)과 M4(리포트·Export) 문서를 먼저 읽고, 이후 작업이 필요로 할 것까지 함께 넣었다.

- `VehicleMaintenanceNote` — Fleet 상세의 "정비 메모"(M3-3 상세 · M3-4 입력). 단일 필드로 덮어쓰지 않고 이력으로 쌓는다: 정비는 "언제 무엇을 봤는지"가 실질이라서
- `Inquiry.answeredById` — 문의함(M3-5)에서 "누가 답변했는지"를 남긴다
- `VehicleFinance.acquiredAt` — Fleet 상세의 도입 시점 표기 · 회계 탭의 감가 맥락
- 리포트(M4-2)의 지표 5종·필터는 기존 테이블 집계로 전부 나온다 — 추가 컬럼 없음
- **Rental에 주행거리 기준점(startOdometerKm)을 두지 않았다**: 모의 주행 속도가 차량 id에서 결정적으로 나오므로(M3-2) `이용 시간 × 속도`로 언제든 같은 값이 재계산된다. 저장할 이유가 없는 파생값이다

### `Vehicle.doorLocked/engineOn` — 통합했다 (제거)

M1-1 스키마 주석의 예고대로 `VehicleTelemetry`로 이관하고 Vehicle에서 지웠다. 근거:

- 스마트키 조작 결과도 결국 "차가 지금 어떤 상태인가"다. 연료·주행거리·좌표와 같은 성격의 값이 두 테이블에 나뉘어 있으면 Fleet 상세가 차량을 두 번 읽어야 하고, 무엇이 최신인지 기준이 둘이 된다
- 데이터 마이그레이션으로 기존 값을 그대로 옮겼다 (표 생성 → 백필 → 옛 컬럼 삭제 순서)
- 스마트키 경로(`rentals.service.ts`)와 핸들러 완료 인계(`handler.service.ts`)는 `TelemetryService`를 거치게 바꿨다. 텔레메트리 행이 없는 차량(테스트·수기 데이터)은 읽는 시점에 배정 존 좌표로 만들어 준다 — 스마트키가 데이터 유무에 따라 깨지지 않게
- 웹 스마트키 패널은 응답 계약(`smartKeyStateRes`)이 그대로라 변경 없음

## 산출물

- schema.prisma · 마이그레이션 · 시드 갱신

## 완료 기준

- migrate + seed 통과 · M1-4 스마트키가 이관된 텔레메트리 필드로 정상 동작(회귀 테스트)

## 테스트

- **백엔드**: 필드 이관 후 스마트키(M1-4) 통합 테스트 회귀 · 시드 경고 케이스(연료 부족/보험 만기/계약 만료) 존재 검증 1건
- **프론트**: 해당 없음

### 결과

- 단위: `telemetry-defaults.spec.ts` 5건 (결정적 초기값)
- 통합: `ops-domain.int-spec.ts` 6건 — 전 차량 텔레메트리·도입/보험 · 전 존 계약(유·무료 혼재) · 경고 4종 · 유의 유저 집계 재료 · 문의함 · Vehicle 임시 필드 제거 확인
- 회귀: 스마트키/이용 플로우/핸들러 완료 통합 테스트를 텔레메트리 기준으로 갱신 (M1-4·M2-3 전부 통과)
- 전체 통합 22 스위트 · 235건 통과 (기존 229 + 6)

## 참고

- [project-review.md](../project-review.md) §5.4 신규 도메인 표
