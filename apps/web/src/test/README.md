# 프론트 테스트 가이드

Vitest + React Testing Library + **MSW 목 서버**. 실제 API 서버나 DB 없이 화면 단위로 돈다.

```bash
pnpm --filter @socar/web test        # 1회 실행
pnpm --filter @socar/web test:watch  # 워치
```

## 규칙

- **신규 화면/컴포넌트를 만드는 모든 작업은 테스트를 포함한다** ([work-plan.md](../../../../docs/work-plan.md) 공통 테스트 기준).
- 최소 커버 대상: 핵심 인터랙션(제출·상태 전환), 검증 에러 표시, **요청 페이로드 검증**.
- API 호출은 반드시 MSW로 가로챈다. 핸들러에 없는 요청은 `onUnhandledRequest: 'error'`로 실패한다 — 목을 빠뜨린 테스트가 조용히 통과하지 않는다.

## 구조

| 파일 | 역할 |
|---|---|
| `setup.ts` | jest-dom · MSW 서버 생명주기 · jsdom 보충(matchMedia/ResizeObserver) |
| `msw/handlers.ts` | 기본 핸들러 (존·차량·인증·예약·이용 플로우·문의/사고). 전 테스트 공통 상태 |
| `msw/fixtures.ts` | 목 데이터. **shared 응답 스키마로 `parse`** 해서 만든다 |
| `msw/server.ts` | `setupServer` 인스턴스 |
| `utils.tsx` | `renderWithProviders` — 세션·앱 라우터(경로·쿼리·동적 파라미터)·SWR 캐시 주입, `MOCK_USERS` |
| `image.ts` | 사진 압축 대역 — `stubImagePipeline()`(캔버스/`createImageBitmap`) · `jpegFile()` |
| `sse.ts` | SSE 대역 — `stubEventSource()` · `lastEventSource().emit(payload)` |

## 쓰는 법

```tsx
import { renderWithProviders, MOCK_USERS, screen } from '@/test/utils';

// 비로그인
renderWithProviders(<HomePage />);

// 역할별 로그인 상태 + 쿼리스트링
const { userEvent, router } = renderWithProviders(<BookPage />, {
  user: MOCK_USERS.personal,
  pathname: '/book/veh-avante',
  searchParams: 'startAt=...&endAt=...',
});

// 동적 라우트(`[id]`) 화면 — useParams()가 읽을 값을 넣는다
renderWithProviders(<BizFleetDetailPage />, {
  user: MOCK_USERS.corpAdmin,
  pathname: '/biz/fleet/veh-corp-ioniq',
  params: { id: 'veh-corp-ioniq' },
});
await userEvent.click(screen.getByRole('button', { name: '결제하기' }));
expect(router.push).toHaveBeenCalledWith('/reservations/resv-1');
```

### 이 테스트만 다른 응답이 필요할 때

```tsx
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';

server.use(
  http.post(`${API}/reservations`, () =>
    HttpResponse.json({ message: '이미 예약된 시간입니다' }, { status: 409 }),
  ),
);
```

### 요청 페이로드 검증

```tsx
let body: unknown;
server.use(
  http.post(`${API}/reservations`, async ({ request }) => {
    body = await request.json();
    return HttpResponse.json(reservationConfirmed, { status: 201 });
  }),
);
// ...인터랙션 후
expect(body).toMatchObject({ insurance: 'FULL', useCredit: true });
```

### 동적 라우트 페이지(`[id]`)

페이지에 `params` prop을 넘기지 않는다. 화면이 `useParams()`로 읽으므로
`renderWithProviders`의 `params` 옵션에 값을 넣는다 (아래 "동적 라우트 화면" 규약 참고).

```tsx
renderWithProviders(<ReservationDetailPage />, {
  user: MOCK_USERS.personal,
  pathname: '/reservations/resv-2',
  params: { id: 'resv-2' },
});
```

## 사진 첨부(PhotoCapture)

jsdom에는 캔버스 JPEG 인코더도 `createImageBitmap`도 없다. 브라우저 전용 부분만
`stubImagePipeline()`으로 대역을 세우면 축소 크기 계산·품질 하향 루프는 실제 코드가 그대로 돈다.

```tsx
import { jpegFile, stubImagePipeline } from '@/test/image';

// 품질 단계별 인코딩 결과 크기를 지정한다 (첫 단계 3MB → 두 번째 단계에서 통과)
stubImagePipeline({ bytesPerStep: [3_000_000, 150 * 1024] });
await userEvent.upload(screen.getByLabelText('사진 촬영'), jpegFile());
```

## 지도(Leaflet)

`ZoneMap`은 캔버스/DOM 측정에 의존해 jsdom에서 의미가 없다. 지도를 쓰는 화면은
`vi.mock('@/components/ZoneMap', ...)`으로 대역을 세우고, 화면의 관심사(존 목록 → 선택 → 상세)만 검증한다.
예시: [`src/app/__tests__/home.test.tsx`](../app/__tests__/home.test.tsx).

## 새 API를 붙일 때

1. 응답 형태를 `packages/shared/src/schemas/api.ts`에 zod 스키마로 추가
2. `msw/fixtures.ts`에 그 스키마로 `parse`한 픽스처 추가
3. `msw/handlers.ts`에 기본 핸들러 추가

### 운영 센터(`/ops`) 목은 이미 있다 — M3-4~6용

M3-3이 백엔드를 끝내면서 픽스처와 기본 핸들러를 미리 넣어 두었다. 화면 작업은 목을
새로 쓰지 말고 이걸 쓰고, 상태가 바뀌는 흐름만 `server.use`로 덮어쓰면 된다.

| 픽스처 | 내용 |
|---|---|
| `opsOverview` · `opsAlerts` | 운영 홈 스탯 · 경고 4종(지연 반납이 맨 위) |
| `opsFleet` · `opsFleetDetail` | 대기/운행(연료 부족)/정비 3행 · 상세(조작 이력·도입/보험·정비 메모) |
| `opsZones` | 유료+만료 임박 1곳 · 무료+잔여 0 1곳 |
| `opsUsersRisk` · `opsUserDetail` | 유의 유저 1명 + 최근 예약/사고 |
| `opsInquiries` | 답변 대기 1건 + 답변 완료 1건 |
| `opsAccountingSummary` | 매출·비용·손익 |
| `opsPlans` | 차량 등록 폼의 요금제 셀렉트 (`GET /ops/plans`) |
| `liveVehicleInUse` · `liveTick({lat,lng})` | SSE 한 틱 — 운행 중 1대. 좌표를 바꿔 넣어 지도 갱신을 검증한다 |

`GET /ops/fleet?state=`와 `GET /ops/inquiries?status=`는 기본 핸들러가 실제로 필터링한다.

### 실시간(SSE) 화면

jsdom에는 `EventSource`가 없다. [`src/test/sse.ts`](./sse.ts)의 `stubEventSource()`로 전송 계층만
대역을 세우면 페이로드 파싱·상태 갱신은 실제 훅(`useLiveFleet`)이 그대로 돈다.

```tsx
stubEventSource();
renderWithProviders(<DashboardPage />, { user: MOCK_USERS.opsAdmin });
lastEventSource().emit(liveTick({ lat: 37.51, lng: 127.04 })); // 한 틱 보내기
```

## 동적 라우트 화면 — `useParams()`로 통일 (규약)

**클라이언트 컴포넌트(`'use client'`)는 라우트 파라미터를 `useParams()`로만 읽는다.**
`params` prop을 받아 `use(params)`로 푸는 형태는 쓰지 않는다.

React 19는 클라이언트에서 만든 프로미스를 `use`로 받지 못해(`uncached promise`) 테스트에서
화면 전체가 서스펜드된 채로 멈춘다. 예전에는 `routeParams()` 헬퍼로 "이미 이행된 thenable"
표식을 붙여 우회했지만, React 내부 규약에 기대는 방식이라 소비자 화면(`use(params)`)과
biz 화면(`useParams()`)이 갈라진 채 남아 있었다. M5-6에서 **`useParams()` 한쪽으로 통일**하고
헬퍼는 제거했다.

```tsx
// app/reservations/[id]/page.tsx
'use client';
import { useParams } from 'next/navigation';

export default function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  ...
}
```

테스트는 `renderWithProviders`의 `params` 옵션으로 값을 넣는다 (`PathParamsContext` 주입).
서버 컴포넌트에서 `params`를 `await`하는 건 여전히 정상이다 — 이 규약은 클라이언트 화면 한정.
