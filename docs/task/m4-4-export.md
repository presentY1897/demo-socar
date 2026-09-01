# M4-4 — Export (CSV/JSON)

- 마일스톤: M4 (지표·차트·Export) · 규모 M
- 상태: ☑ 완료 (2026-09-01)
- 의존: M4-2

## 목적

피드백 #6 "필터링해서 json이나 csv등으로 export하는 기능". 리포트와 주요 목록을 적용 중인 필터 그대로 파일로 내려받는다.

## 작업 내용

- [x] 공통 Export 유틸(API): rows → CSV 직렬화(헤더 한국어 라벨, 값 이스케이프) / JSON 그대로
  - CSV는 **UTF-8 BOM** 포함 · `Content-Disposition: attachment` — 한글 파일명은 RFC 5987 `filename*`로 싣고 ASCII 대체본을 함께 남긴다
- [x] 적용 대상 5곳 — 전부 `?format=csv|json` (미지정 시 기존 JSON 응답 그대로, 알 수 없는 값은 400)
- [x] 웹: 리포트 화면과 각 목록 상단에 내보내기 버튼(CSV/JSON)

### Export 5종

| 대상 | 엔드포인트 | CSV 열 | 필터 반영 |
|---|---|---|---|
| 리포트 | `GET /ops/reports` | 축 라벨 · `지표(단위)` 2열 (값은 숫자 그대로) | 화면이 조회에 쓰는 쿼리 그대로(metric·groupBy·from·to·zoneId·model) |
| 차량 표 | `GET /ops/fleet` | 21열 — 텔레메트리·보험·다음 예약을 손으로 펴서 | `state` + **`sort`·`dir`** (아래 결정) |
| 작업 목록 | `GET /ops/tasks` | 14열 — 출발/도착은 라벨만, 인계 메모 포함 | 서버가 지원하는 `status`·`type`·`date` (화면은 전건) |
| 유의 유저 | `GET /ops/users/risk` | 7열 — 화면이 감춘 위험 점수까지 | 필터 없음(전건) |
| 내 예약 | `GET /reservations/mine` | 18열 — 수령 방식(왕복/편도/부름)·요금 내역·실제 반납 | 로그인 사용자로 이미 좁혀져 있음 |

### 결정

- **"예약 목록"은 `GET /reservations/mine`으로 읽었다.** 앱에 있는 유일한 예약 목록 화면(`/reservations`)이 이것이고, 작업 문서가 나머지 셋만 경로를 적어 둔 것도 이 하나만 경로가 자명하지 않았기 때문으로 봤다. 운영 전용 예약 목록 엔드포인트를 새로 만드는 쪽은 작업 문서에 없는 계약이라 택하지 않았다. 이 한 곳만 OPS 전용이 아니지만 **조회 자체가 로그인 사용자로 좁혀져 있어** 남의 예약이 새지 않는다(통합 테스트로 확인).
- **차량 표: 정렬 규칙을 shared로 옮겨 서버가 같은 함수를 쓴다.** 화면은 여전히 클라이언트에서 정렬하지만(즉시 반응) `sortFleet`이 shared에 있으므로 `?sort=&dir=`을 받은 서버가 **같은 순서**를 낸다. 흉내가 아니라 같은 코드다 — 흉내는 언젠가 어긋난다.
- **작업 목록: 서버 순서(기한 오름차순)로 한 벌만 낸다.** 화면은 한 목록을 미배정·진행 중·처리량 셋으로 가르지만 파일을 셋으로 쪼개면 합계가 어디에도 없다. 분류 기준(상태)이 열로 실려 있어 받는 쪽에서 다시 가를 수 있고, 서버 순서는 화면이 각 덩어리 안에서 쓰는 순서(`byDue`)와 같다. `buildTaskBoard`는 dayjs에 의존해 shared로 옮길 수 없었다.
- **CSV 평탄화는 자동이 아니라 열 정의(`ExportColumn`)로 한다.** 중첩을 자동으로 펴면 `telemetry.fuelPct` 같은 헤더가 나오는데 그건 사람이 읽는 표가 아니다. 값이 없는 중첩(보험 정보가 없는 차)은 빈 칸으로 남는다.
- **리포트 CSV의 값은 숫자 그대로**(`120000`) 내고 단위는 헤더에 적는다(`매출(원)`). `120,000원`처럼 꾸미면 엑셀이 문자열로 읽어 합계가 안 잡힌다.
- **다운로드는 링크가 아니라 fetch + Blob이다.** API가 `Authorization` 헤더를 요구하는데 링크 클릭에는 헤더를 실을 수 없다. 파일 이름은 서버가 붙인 것을 그대로 쓴다 — 조건이 이름에 들어 있어 화면이 다시 만들면 규칙이 갈린다.
- 상태·연료·예약 상태의 한국어 표기를 shared로 옮겼다. 화면은 "이용 완료"인데 파일은 `COMPLETED`이면 같은 데이터로 읽히지 않는다.

## 산출물

- `apps/api/src/common/export/` — `csv.ts`(BOM·이스케이프, 순수) · `export.ts`(열 정의·파일명·`Content-Disposition`·`?format=` 파싱)
- 열 정의 5벌 — `ops/fleet/fleet-export.ts` · `ops/tasks/tasks-export.ts` · `ops/users/users-export.ts` · `ops/reports/reports-export.ts` · `reservations/reservations-export.ts`
- `packages/shared/src/schemas/export.ts` · `packages/shared/src/ops/fleet-sort.ts`(웹에서 이관)
- `apps/web/src/lib/download.ts` · `apps/web/src/components/ExportButtons.tsx` · 화면 5곳 배치
- `apps/web/src/test/download.ts` — 파일 저장 대역

## 완료 기준

- [x] 통합 테스트: format=csv 응답의 Content-Type/Disposition/BOM · 필터 반영
- [ ] 다운로드한 CSV를 엑셀에서 열어 한글·숫자 정상 확인 (수동 1회 — **M4-5로 넘김**, 이 환경에 엑셀이 없다. BOM(0xFEFF)·이스케이프·한글 헤더는 자동 테스트가 지킨다)

## 테스트

- **백엔드(통합)**: `test/ops-export.int-spec.ts` 14건 (277 → 291) — 존 이름에 쉼표를, 인계 메모에 따옴표·쉼표·개행을 **실제로 심고** CSV를 되읽어 대조. Content-Type·Disposition·BOM · 필터/정렬 반영 · format 미지정 시 기존 JSON 유지 · 알 수 없는 format 400 · 비 OPS 403·비로그인 401 · 남의 예약이 섞이지 않는지
- **백엔드(단위)**: `src/common/export/export.spec.ts` 18건 (55 → 73) — 이스케이프 3종·BOM·CRLF·빈 목록 헤더·파일명·RFC 5987·KST 생성일·format 파싱
- **프론트**: 16건 추가 (226 → 242)
  - `components/__tests__/ExportButtons.test.tsx` (9) — 형식 2종 · 현재 쿼리 전달 · 서버 파일명 사용 · Blob URL 회수 · 실패 알림 · `Content-Disposition` 파싱 4종
  - `dashboard/__tests__/ops-export.test.tsx` (7) — 배치 5곳이 각각 올바른 경로·필터로 내려받는지 (리포트 필터 변경 추종 · 차량 state+sort+dir · 예약 없으면 버튼도 없음)

## 참고

- [project-review.md](../project-review.md) §5.5
