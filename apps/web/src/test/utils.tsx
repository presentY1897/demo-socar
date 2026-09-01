import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { vi } from 'vitest';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  PathParamsContext,
  PathnameContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { AuthUser } from '@socar/shared';
import { SessionProvider } from '@/lib/session';
import {
  userCorpAdmin,
  userCorpApprover,
  userCorpMember,
  userCorpViewer,
  userOpsAdmin,
  userPersonal,
} from './msw/fixtures';

/** 역할별 목 유저 — `renderWithProviders(ui, { user: MOCK_USERS.opsAdmin })` */
export const MOCK_USERS = {
  personal: userPersonal,
  corpViewer: userCorpViewer,
  corpMember: userCorpMember,
  corpApprover: userCorpApprover,
  corpAdmin: userCorpAdmin,
  opsAdmin: userOpsAdmin,
} satisfies Record<string, AuthUser>;

/**
 * Next 15의 페이지 `params`(Promise)를 테스트에서 넘길 때 쓴다.
 *
 * 페이지는 `use(params)`로 값을 풀는데, jsdom 환경에서는 서스펜스 재개가 흐르지 않아
 * 화면이 영원히 fallback에 머문다. React가 내부적으로 쓰는 "이미 이행된 thenable" 표식을
 * 미리 붙여 두면 `use`가 동기적으로 값을 돌려주고 서스펜스 자체가 일어나지 않는다.
 */
export function routeParams<T extends object>(value: T): Promise<T> {
  const thenable = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  thenable.status = 'fulfilled';
  thenable.value = value;
  return thenable;
}

/** 앱 라우터 목 — push/replace 호출 여부로 화면 이동을 검증한다 */
export function createRouterMock(): AppRouterInstance {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  } as unknown as AppRouterInstance;
}

interface Options extends RenderOptions {
  /** 로그인 상태로 렌더 (미지정 = 비로그인) */
  user?: AuthUser | null;
  pathname?: string;
  /** 'a=1&b=2' 형태 */
  searchParams?: string;
  /** 동적 라우트 파라미터 — useParams() 가 읽는다 (예: { id: 'veh-1' }) */
  params?: Record<string, string>;
  router?: AppRouterInstance;
}

/**
 * 세션 · 앱 라우터 컨텍스트 · SWR 캐시를 주입한 렌더.
 *
 * - 세션: SessionProvider가 localStorage에서 유저를 읽으므로 실제 로그인과 같은 형태로 심는다
 * - 라우터: next/link와 useRouter/usePathname/useSearchParams/useParams가 컨텍스트 없이는 던지므로 실제 컨텍스트를 채운다
 * - SWR: provider를 매번 새로 만들어 테스트 간 캐시가 새지 않게 한다
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    user,
    pathname = '/',
    searchParams = '',
    params = {},
    router = createRouterMock(),
    ...options
  }: Options = {},
): RenderResult & { userEvent: ReturnType<typeof userEvent.setup>; router: AppRouterInstance } {
  if (user) {
    localStorage.setItem('mocar_token', `mock-token-${user.id}`);
    localStorage.setItem('mocar_user', JSON.stringify(user));
  }

  const result = render(ui, {
    wrapper: ({ children }) => (
      <AppRouterContext.Provider value={router}>
        <PathnameContext.Provider value={pathname}>
          <PathParamsContext.Provider value={params}>
            <SearchParamsContext.Provider value={new URLSearchParams(searchParams)}>
              <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <SessionProvider>{children}</SessionProvider>
              </SWRConfig>
            </SearchParamsContext.Provider>
          </PathParamsContext.Provider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    ),
    ...options,
  });

  return { ...result, userEvent: userEvent.setup(), router };
}

export * from '@testing-library/react';
