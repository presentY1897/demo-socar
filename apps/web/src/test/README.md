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
| `msw/handlers.ts` | 기본 핸들러 (존·차량·인증·예약). 전 테스트 공통 상태 |
| `msw/fixtures.ts` | 목 데이터. **shared 응답 스키마로 `parse`** 해서 만든다 |
| `msw/server.ts` | `setupServer` 인스턴스 |
| `utils.tsx` | `renderWithProviders` — 세션·앱 라우터·SWR 캐시 주입, `MOCK_USERS`, `routeParams` |
| `image.ts` | 사진 압축 대역 — `stubImagePipeline()`(캔버스/`createImageBitmap`) · `jpegFile()` |

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

### 동적 라우트 페이지(`params`)

Next 15의 `params`는 Promise다. 페이지가 `use(params)`로 푸는데 jsdom에서는 서스펜스 재개가
흐르지 않아 화면이 fallback에 멈춘다 — `routeParams()`로 감싸서 넘긴다.

```tsx
renderWithProviders(<ReservationDetailPage params={routeParams({ id: 'resv-2' })} />, {
  user: MOCK_USERS.personal,
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
