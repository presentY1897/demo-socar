# M3-7 — M3 검증·문서·배포

- 마일스톤: M3 (운영 백오피스 재설계) · 규모 S
- 상태: ☑ 완료
- 의존: M3-4 ~ M3-6

## 목적

M3 마일스톤 마감 — 백오피스 재설계 검증, 텔레메트리 설계 기록, 배포.

## 작업 내용

- [x] 집계/텔레메트리 + 프론트(MSW) 테스트 정리, 전건 통과 (README 테스트 숫자 갱신)
- [x] **ADR-009 작성** — "텔레메트리 모의 설계": 워커 없이 조회 시점 계산을 택한 이유(무료 티어 제약), 모의 값의 일관성 규칙(반납 정산 주행거리와의 정합), 실차 연동 시 교체 지점(인터페이스)
- [x] README 백오피스 섹션 재작성 — "운영 어드민" → "운영 센터"(6탭) 설명으로 교체
- [x] `SEED_VERSION` 확인 → ~~main 머지 → 푸시 → 배포 스모크~~
      **배포는 사용자 결정으로 이번 세션 스코프 아웃 — 로컬 런타임 스모크로 대체**
- [x] work-plan 인덱스·작업 문서 상태 갱신

## 산출물

- `docs/adr/009-ops-backoffice-telemetry.md`(신규) · README 갱신 · 로컬 런타임 스모크

> 문서명은 계획의 `009-telemetry-simulation.md`에서 바꿨다. ADR이 담게 된 결정이
> 텔레메트리 모의만이 아니라 **`/dashboard` 6탭 재설계 · 경고 목적지 · 회계 분리**까지
> 걸쳐 있어서, 파일명이 내용의 절반만 가리키는 상태가 되기 때문이다.

## 완료 기준

- ~~배포 URL에서~~ **로컬에서** ops 계정으로: 경고 확인 → 차량 상세 센서 → 작업 배정 →
  계약 수정 → 문의 답변 → 회계 손익까지 6탭 완주

## 로컬 런타임 스모크 결과 (2026-09-01)

`node dist/main.js`(:4000) + `socar_m3`(시드 v8), `ops@demo.mocar.kr` 토큰으로 확인.

### ① 경고 피드 — **4종 전부 검출** (기준 3종 이상)

| kind | severity | tab | title |
|---|---|---|---|
| `LATE_RETURN` | danger | customers | 김소카님 반납 42분 지연 |
| `LOW_FUEL` | warn | fleet | 카니발 00허 0002 연료 12% |
| `CONTRACT_EXPIRING` | warn | zones | 공항입구 주차장 계약 D-12 |
| `INSURANCE_EXPIRING` | warn | fleet | K5 1001허 6069 보험 D-18 |

`GET /ops/overview` → `vehicleCount 73 · inUse 2 · inTransit 1 · idle 69 · maintenance 1 ·
todayReservation 3 · unassignedTask 2 · openInquiry 2 · alertCount 4`.

### ② SSE `/metrics/vehicles/live` — 좌표가 실제로 움직인다

22초 구독(5틱, 18.5초 간격)에서 상태별 이동 거리:

| 차량 | 상태 | 5틱 이동 | 비고 |
|---|---|---|---|
| K5 1001허 6069 | `IN_USE` | **58.8 m** | 매 틱 lat/lng 갱신 |
| 쏘렌토 1002허 4939 | `IN_TRANSIT` | **98.0 m** | A\* 추정 시간 페이스 |
| 레이 1000허 9499 | `IN_USE`(지연 반납) | 0 m | 진행률 1 고정 — 주행거리·연료만 증가 |
| EV6 1070허 8364 | `MAINTENANCE` | 0 m | 대기 중 불변 |

### ③ 시드 보강 (`SEED_VERSION` 7 → 8)

첫 스모크에서 **움직이는 차가 한 대도 없었다.** 시드의 유일한 진행 중 이용이 "지연 반납"
케이스였고, 반납 예정 시각을 넘긴 이동은 진행률이 1로 고정돼 좌표가 도착점에 붙는다
(`telemetry-mock.positionAt`). M3-2의 완료 기준("운행 중 차량이 SSE에서 5초마다 움직임")과
M3-4의 완료 기준("운행 중 차량이 지도에서 움직임")이 시드만으로는 확인되지 않는 상태였다.

시드에 두 건을 더했다 — 둘 다 **경고가 아니라 상태를 채우는** 데이터다.

- **진행 중 이용 1건** (`startAt = -1h`, `endAt = +6h`) — 시드 후 6시간 동안 좌표가 움직인다
- **탁송 중(`EN_ROUTE`) 재배치 작업 1건** — 상태 4종 중 `IN_TRANSIT`이 시드에 없어
  Fleet 탭 상태 필터와 운영 홈 "탁송 중" 스탯이 늘 0이었다. 같은 지역에서 **가장 먼 존**을
  목적지로 잡는다(가까우면 A\* 추정 시간이 짧아 몇 분 만에 도착해 멈춘다)

### ④ 나머지 엔드포인트

| 엔드포인트 | 결과 |
|---|---|
| `GET /ops/fleet` | 200 · 73대 (상태 필터 `IDLE 69 / IN_USE 2 / IN_TRANSIT 1 / MAINTENANCE 1`) |
| `GET /ops/fleet/:id` | 200 · 센서 + `finance` + `controlLogs` + `maintenanceNotes` |
| `GET /ops/zones` | 200 · 31곳 (계약·배정 수·잔여 자리) |
| `GET /ops/users/risk` | 200 · 2명 (김소카 지연17·사고1·결제거절2 / 이직원 지연9) |
| `GET /ops/inquiries` | 200 · 3건 (OPEN 2) |
| `GET /ops/accounting/summary` | 200 · 아래 표 |

### ⑤ 6탭 완주 (쓰기 포함)

경고 확인 → 차량 상세 센서 → **작업 배정**(후보 조회 → `POST /ops/tasks/:id/assign` 201,
핸들러 큐 `today 3 / open 1`로 교차 확인) → **존 계약 수정**(`PATCH` 200, 유료인데 0원 → 400)
→ **문의 답변**(201 → `ANSWERED`, 재답변 409) → **회계 손익**까지 완주.

```
  days= 7  매출 2,814,280   비용 20,608,000   손익 -17,793,720   마진 -632.3%
  days=30  매출 7,226,000   비용 20,608,000   손익 -13,382,000   마진 -185.2%
  days=90  매출 7,854,740   비용 20,608,000   손익 -12,753,260   마진 -162.4%
```

**비용이 기간과 무관하게 고정**인 것이 눈으로 확인된다 — 회계 탭이 라벨(`비용 (월 고정)`)과
안내 문구로 표기하는 이유(ADR-009 결정 6). 스모크 후 DB는 다시 시드해 원상 복구했다.

### ⑥ 권한 경계

`user@demo.mocar.kr`(개인)로 `/ops/overview` · `/ops/alerts` · `/ops/fleet` · `/ops/zones` ·
`/ops/users/risk` · `/ops/inquiries` · `/ops/accounting/summary` · `/metrics/summary`
**전부 403**, SSE `?token=`(개인 토큰)도 **403**, 토큰 없이 `/ops/alerts` **401**.

### ⑦ 스모크가 잡은 문구 버그 1건

`LOW_FUEL` 경고의 `detail`이 `"… — 주유이 필요합니다"`로 나왔다
(`${fuel === 'EV' ? '충전' : '주유'}이 필요합니다` — 조사가 EV 쪽에만 맞는다).
`'충전이' / '주유가'`로 갈라 고쳤다 (`alerts/alert-rules.ts`).

## 회귀 점검 — 플레이키 테스트 조사

M3-6이 "turbo 실행 1회가 web test에서 실패했으나 재현 안 됨"을 남겨 조사했다.

- `pnpm turbo run test --force` **5회 연속** — 전부 통과 (shared 81 · api 55 · web 172)
- `pnpm --filter @socar/web test` **5회 연속** — 전부 통과
- 16코어에 busy-loop **24개**를 띄워 CPU를 포화시킨 상태에서 web 1회 — 통과
- **총 11회 재현 실패.** 유력 가설은 RTL `waitFor`/`findBy*`의 기본 타임아웃 1초와
  turbo 병렬 실행 시의 CPU 경합이지만, 위 부하 실험에서도 재현되지 않아 **추측 수정은 하지 않았다**
- 매 실행에 뜨는 `@socar/api:test: A worker process has failed to exit gracefully`는
  **결정적으로 항상** 나오고 `--detectOpenHandles`(=`--runInBand`)에서는 사라진다.
  실제 열린 핸들이 보고되지 않고 실패와 동반한 적도 없어 jest 워커 종료 시의 무해한 경고로 본다

## 최종 테스트 집계

| 구분 | 수 | 비고 |
|---|---|---|
| 단위 (shared 81 + api 55) | **136** | DB 불필요 |
| 프론트 (Vitest + RTL + MSW) | **172** | 27 파일 |
| 통합 (Supertest + PostgreSQL) | **258** | 24 스위트 |

## 참고

- [work-plan.md](../work-plan.md) 작업 단위 규칙 · [ADR-009](../adr/009-ops-backoffice-telemetry.md)
