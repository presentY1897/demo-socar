# 배포

무료 티어만으로 구성했다 — 웹 Vercel · API Render · DB Neon.

- **웹**: Vercel — Root Directory를 `apps/web`으로 설정, `NEXT_PUBLIC_API_URL` 환경변수 지정.
  `@socar/shared`는 `dist/`로 해석되므로 웹 빌드 전에 먼저 빌드돼야 하는데, 그 순서를
  배포 대시보드 설정에만 맡기지 않으려고 `prebuild` 스크립트로 저장소에 고정했다 —
  `pnpm --filter @socar/web build`만 실행해도 shared가 먼저 선다 (API도 동일)
- **DB**: Neon — 무료 PostgreSQL, 연결 문자열을 Render에 입력
- **API**: Render — 저장소 루트의 `render.yaml` Blueprint 사용 (`DATABASE_URL`, `WEB_ORIGIN` 입력)

## 배포 후 스모크 체크리스트

기능이 7개 영역으로 늘어 "빌드가 됐다"만으로는 동작을 보증할 수 없다. 배포 후 이 순서로 확인한다.

| # | 확인 | 어디서 |
|---|---|---|
| 1 | `/health`가 `{ok:true}` | API URL |
| 2 | 시드가 새 버전으로 재적재됐는지 (`AUTO_SEED: 시드 vN → vM` 로그) | Render 로그 |
| 3 | 데모 계정 7종 로그인 → 각자의 랜딩(`/`·`/biz`·`/dashboard`·`/handler`) | 웹 |
| 4 | 홈에서 이용 시간 변경 → 존 선택 → "바로 픽업"과 "부름" 구분 표시 | 웹 |
| 5 | 예약 → 체크인(사진) → 스마트키 → 체크아웃 → 반납 정산 완주 | `user@` |
| 6 | 운영 홈 경고 피드 4종 + **지도의 운행 중 차량이 실제로 움직이는지**(SSE) | `ops@` |
| 7 | 리포트 탭에서 지표·축·기간을 바꾸면 차트와 표가 함께 갱신 | `ops@` |
| 8 | CSV 내려받아 엑셀에서 한글이 깨지지 않는지 | `ops@` |
| 9 | 핸들러 작업 수락 → 이동 → 완료 후 차량 존이 바뀌는지 | `handler@` |
| 10 | 등급별 화면 분기(`viewer@`는 요청 버튼 없음, `approver@`는 승인 가능) | `/biz` |

**6번(SSE)이 배포 환경에서 가장 불확실하다.** 로컬에서는 5틱에 58~98m 이동을 실측했지만,
프록시가 `text/event-stream`을 버퍼링하면 이벤트가 뭉쳐서 도착하거나 끊긴다. 지도가 안 움직이면
브라우저 devtools의 Network에서 `vehicles/live` 응답이 스트리밍으로 들어오는지부터 본다.

## 콜드 스타트 대응

Render 무료 티어는 유휴 15분 후 슬립되어 첫 요청이 30~60초 걸린다. 두 겹으로 대응:

1. **웜업 게이트** (`apps/web/src/components/ServerWarmup.tsx`): 접속 시 `/health`를 확인해
   서버가 잠들어 있으면 진행 상황 오버레이를 띄우고, 깨어나면 SWR 캐시 전체를 재검증한다
2. **외부 킵얼라이브 (선택)**: [UptimeRobot](https://uptimerobot.com) 무료 플랜으로
   `/health`를 5분 간격 모니터링하면 슬립 자체를 막을 수 있다 (Render 무료 750시간/월로
   단일 서비스 상시 가동 가능). GitHub Actions cron은 저장소가 public일 때만 무료라는 점 주의

## 배포 DB 시드 — 버전 마커로 자동 관리

무료 티어에는 셸이 없어 부팅 시점에 시드를 판단한다. 시드 코드의 `SEED_VERSION`이
DB의 `SeedMeta` 기록보다 높으면 그 배포에서 **딱 1회 자동 재시드**된다 — 시드 내용을
바꿀 때 버전만 +1 하면 되고, 수동 개입이 없다. `AUTO_SEED=force`는 비상용(무조건 재시드).
