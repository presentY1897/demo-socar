# M0-2 — 프론트 테스트 기반 구축 (Vitest + RTL + MSW)

- 마일스톤: M0 (기반 정비) · 규모 M
- 상태: ☑ 완료 (2026-09-01)
- 의존: 없음 (M1 이후 모든 프론트 작업의 선행)

## 목적

2차 피드백: "작업별 최소 테스트가 없다 — 프론트는 mocking 서버를 사용할 것". 현재 프론트 테스트가 전무하므로, 이후 모든 작업의 프론트 필수 테스트가 올라갈 기반을 먼저 만든다. API는 **MSW(Mock Service Worker) 목 서버**로 대체한다.

## 작업 내용

- [x] `apps/web`에 Vitest + React Testing Library + jsdom + MSW 설치·설정 (`vitest.config.ts`, `test` 스크립트, turbo 파이프라인에 등록)
- [x] MSW 공용 구조: `apps/web/src/test/msw/handlers.ts` — 주요 API(존/차량/예약/세션) 기본 핸들러. **응답 형태는 shared zod 스키마에서 파생**해 실제 계약과 어긋나지 않게
- [x] 테스트 유틸: 렌더 래퍼(세션 컨텍스트 주입 — 역할별 목 유저), MSW 서버 setup/teardown 공통화
- [x] 예시 테스트 2건으로 기반 검증: ① 홈 — MSW 존 목록으로 지도/리스트 렌더 ② `TimeRangePicker` — 10분 단위·최소 30분 규칙 인터랙션
- [x] 이후 규칙 문서화: 모든 신규 화면/컴포넌트 작업은 MSW 기반 테스트 포함 (work-plan 공통 테스트 기준 참조)

## 산출물

- vitest 설정 · `src/test/msw/` 공용 핸들러 · 렌더 유틸 · 예시 테스트 2건

## 테스트

- 이 작업 자체가 테스트 기반 — 예시 테스트 2건 통과가 검증

## 완료 기준

- `pnpm --filter @socar/web test` 통과 · MSW 핸들러가 shared 스키마 기반으로 타입 체크됨 · `pnpm test`(루트)에 web 테스트 포함

## 참고

- [work-plan.md](../work-plan.md) 공통 테스트 기준

## 결과 (2026-09-01)

- `apps/web`: Vitest 3 + RTL 16 + jsdom + MSW 2 + `vite-tsconfig-paths`. `pnpm --filter @socar/web test`
- API 응답 계약을 `packages/shared/src/schemas/api.ts`로 신설 — MSW 픽스처는 이 스키마로 `parse`해서 만든다(계약이 바뀌면 목이 먼저 깨짐)
- `renderWithProviders`: 세션(localStorage) · **실제 Next App Router 컨텍스트**(next/link·useRouter·usePathname·useSearchParams가 컨텍스트 없이 던지므로) · 격리된 SWR 캐시 주입
- `onUnhandledRequest: 'error'` — 목을 빠뜨린 요청은 테스트 실패
- 예시 테스트 10케이스: 홈 4건(마커 렌더·존 선택 시 픽업/부름 구분·빈 존 안내·요청 쿼리 검증), TimeRangePicker 6건(10분 단위 144개·KST 표시·시작/반납 독립 변경·빈 입력 방어)
- 부수 발견: `TimeRangePicker`에서 날짜 입력을 비우면 `Invalid Date`로 던지던 버그를 가드로 수정
- `turbo.json` lint에 `dependsOn: ["^build"]` 추가 — shared 미빌드 상태에서 `pnpm lint`가 실패하던 문제 해소
- 검증: `pnpm build` 3/3 · `pnpm lint` 4/4 · `pnpm test` 22케이스(api 12 + web 10) · `test:int` 14케이스 회귀
