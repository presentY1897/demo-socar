import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import DashboardPage from '@/app/dashboard/page';
import ReservationsPage from '@/app/reservations/page';
import { server } from '@/test/msw/server';
import { stubDownloads } from '@/test/download';
import { stubEventSource } from '@/test/sse';
import {
  MOCK_USERS,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@/test/utils';

vi.mock('@/components/ZoneMap', () => ({ default: () => <div data-testid="ops-map" /> }));
vi.mock('@/components/charts/chart-lib', async () => (await import('@/test/chart')).chartLibMock());

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * 내보내기 요청만 가로채 URL을 기록한다.
 * `format`이 붙은 요청만 파일 응답으로 바꾸고 나머지는 기본 핸들러로 흘려보낸다 —
 * 그래야 화면이 평소처럼 그려진 상태에서 버튼을 누를 수 있다.
 */
function recordExports(path: string): string[] {
  const asked: string[] = [];
  server.use(
    http.get(`${API}${path}`, ({ request }) => {
      const url = new URL(request.url);
      if (!url.searchParams.has('format')) return undefined;
      asked.push(url.search.slice(1));
      return HttpResponse.text('﻿헤더\r\n값\r\n', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="x.csv"`,
        },
      });
    }),
  );
  return asked;
}

const renderTab = (searchParams: string) => {
  stubEventSource();
  return renderWithProviders(<DashboardPage />, {
    user: MOCK_USERS.opsAdmin,
    pathname: '/dashboard',
    searchParams,
  });
};

/** 패널 제목(h2)으로 그 패널만 좁힌다 — '차량'은 본문에도 여러 번 나온다 */
const panel = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;
const csvIn = (scope: HTMLElement) => within(scope).getByRole('button', { name: 'CSV' });

describe('내보내기 — 화면의 필터가 파일에 그대로 걸린다', () => {
  it('리포트: 지금 보고 있는 조건 그대로 내려받는다', async () => {
    const asked = recordExports('/ops/reports');
    stubDownloads();
    const { userEvent } = renderTab(
      'tab=reports&metric=utilization&groupBy=zone&from=2026-07-01&to=2026-07-31&zoneId=zone-gangnam',
    );

    await screen.findByText('리포트 조건');
    await userEvent.click(csvIn(panel('리포트 조건')));

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(new URLSearchParams(asked[0])).toEqual(
      new URLSearchParams(
        'metric=utilization&groupBy=zone&from=2026-07-01&to=2026-07-31&zoneId=zone-gangnam&format=csv',
      ),
    );
  });

  it('리포트: 필터를 바꾸면 내려받는 조건도 따라 바뀐다', async () => {
    const asked = recordExports('/ops/reports');
    stubDownloads();
    const { userEvent } = renderTab('tab=reports');

    await screen.findByText('리포트 조건');
    await userEvent.selectOptions(screen.getByLabelText('지표'), 'lateReturnRate');
    await userEvent.click(csvIn(panel('리포트 조건')));

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(new URLSearchParams(asked[0]).get('metric')).toBe('lateReturnRate');
  });

  it('차량 표: 상태 필터와 정렬이 함께 실린다 (표에서 본 순서 그대로)', async () => {
    const asked = recordExports('/ops/fleet');
    stubDownloads();
    const { userEvent } = renderTab('tab=fleet');

    await screen.findByRole('button', { name: '차량 등록' });
    await userEvent.click(screen.getByRole('button', { name: '운행' }));
    await userEvent.selectOptions(screen.getByLabelText('정렬'), 'fuelPct');
    await userEvent.click(csvIn(panel('차량')));

    await waitFor(() => expect(asked).toHaveLength(1));
    const params = new URLSearchParams(asked[0]);
    expect(params.get('state')).toBe('IN_USE');
    expect(params.get('sort')).toBe('fuelPct');
    expect(params.get('dir')).toBe('asc');
    expect(params.get('format')).toBe('csv');
  });

  it('작업 목록: 화면이 셋으로 가른 것을 파일은 한 벌로 낸다', async () => {
    const asked = recordExports('/ops/tasks');
    stubDownloads();
    const { userEvent } = renderTab('tab=dispatch');

    await screen.findByText('미배정 작업');
    await userEvent.click(screen.getByRole('button', { name: 'CSV' }));

    await waitFor(() => expect(asked).toEqual(['format=csv']));
  });

  it('유의 유저: 목록과 같은 엔드포인트로 내려받는다', async () => {
    const asked = recordExports('/ops/users/risk');
    stubDownloads();
    const { userEvent } = renderTab('tab=customers');

    await screen.findByText('유의 유저');
    await userEvent.click(csvIn(panel('유의 유저')));

    await waitFor(() => expect(asked).toEqual(['format=csv']));
  });
});

describe('내 예약 내보내기', () => {
  it('내 예약 목록을 파일로 받는다', async () => {
    const asked = recordExports('/reservations/mine');
    stubDownloads();
    const { userEvent } = renderWithProviders(<ReservationsPage />, {
      user: MOCK_USERS.personal,
      pathname: '/reservations',
    });

    await screen.findByRole('button', { name: 'JSON' });
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));

    await waitFor(() => expect(asked).toEqual(['format=json']));
  });

  it('내려받을 예약이 없으면 버튼도 없다', async () => {
    server.use(http.get(`${API}/reservations/mine`, () => HttpResponse.json([])));
    renderWithProviders(<ReservationsPage />, {
      user: MOCK_USERS.personal,
      pathname: '/reservations',
    });

    await screen.findByText(/아직 예약이 없어요/);
    expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
  });
});
