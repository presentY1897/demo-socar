import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { OPS_TAB_LABEL, REPORT_METRIC_META, shiftDate } from '@socar/shared';
import { dayTickLabel } from '@/lib/chart-config';
import DashboardPage from '@/app/dashboard/page';
import { server } from '@/test/msw/server';
import { chartInstances, lastChart } from '@/test/chart';
import { reportOptions } from '@/test/msw/fixtures';
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

/** 리포트 탭이 실제로 보낸 쿼리를 순서대로 모은다 */
function recordQueries(): string[] {
  const asked: string[] = [];
  server.use(
    http.get(`${API}/ops/reports`, async ({ request }) => {
      const url = new URL(request.url);
      asked.push(url.search.slice(1));
      const { makeReport } = await import('@/test/msw/fixtures');
      return HttpResponse.json(makeReport(url.searchParams));
    }),
  );
  return asked;
}

const renderReports = (searchParams = 'tab=reports') => {
  stubEventSource();
  return renderWithProviders(<DashboardPage />, {
    user: MOCK_USERS.opsAdmin,
    pathname: '/dashboard',
    searchParams,
  });
};

const panel = (title: string) => screen.getByText(title).closest('section') as HTMLElement;
const param = (query: string, key: string) => new URLSearchParams(query).get(key);

describe('운영 센터 — ⑦ 리포트', () => {
  it('리포트 탭이 shared 탭 목록에 있고 눌러서 열 수 있다', async () => {
    const { userEvent } = renderReports('');

    await userEvent.click(screen.getByRole('tab', { name: OPS_TAB_LABEL.reports }));

    expect(await screen.findByText('리포트 조건')).toBeInTheDocument();
  });

  it('기본 조건(매출 × 일자, 최근 30일)으로 조회하고 차트·표를 함께 그린다', async () => {
    const asked = recordQueries();
    renderReports();

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(param(asked[0], 'metric')).toBe('revenue');
    expect(param(asked[0], 'groupBy')).toBe('day');
    expect(param(asked[0], 'zoneId')).toBeNull(); // 빈 필터는 싣지 않는다

    // 기본 기간은 오늘까지 30일 — 목은 요청한 시작일부터 3일치를 돌려준다
    const from = param(asked[0], 'from')!;
    expect(shiftDate(from, 29)).toBe(param(asked[0], 'to'));

    // 차트: 일자는 선, 라벨은 연도를 뗀 날짜
    await waitFor(() => expect(chartInstances()).toHaveLength(1));
    expect(lastChart().config.type).toBe('line');
    expect(lastChart().config.data.labels).toEqual(
      [0, 1, 2].map((i) => dayTickLabel(shiftDate(from, i))),
    );

    // 표: 차트와 같은 행 + 합계
    const table = within(panel('표')).getByRole('table');
    expect(within(table).getByText(from)).toBeInTheDocument();
    expect(within(table).getByText('10,000원')).toBeInTheDocument();
    expect(within(table).getAllByText('60,000원').length).toBeGreaterThan(0); // 전체 합계
  });

  it('URL 쿼리에 적힌 조건으로 시작한다 — 링크로 같은 리포트를 재현한다', async () => {
    const asked = recordQueries();
    renderReports('tab=reports&metric=utilization&groupBy=zone&from=2026-07-01&to=2026-07-31&zoneId=zone-gangnam');

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(new URLSearchParams(asked[0])).toEqual(
      new URLSearchParams(
        'metric=utilization&groupBy=zone&from=2026-07-01&to=2026-07-31&zoneId=zone-gangnam',
      ),
    );
    expect(await screen.findByText(/가동률 · 존별/)).toBeInTheDocument();
  });

  it('지표를 바꾸면 새 쿼리로 다시 묻고 URL에도 남긴다', async () => {
    const asked = recordQueries();
    const { userEvent, router } = renderReports();
    await waitFor(() => expect(asked).toHaveLength(1));

    await userEvent.selectOptions(screen.getByLabelText('지표'), 'lateReturnRate');

    await waitFor(() => expect(param(asked.at(-1)!, 'metric')).toBe('lateReturnRate'));
    expect(router.replace).toHaveBeenCalledWith(
      expect.stringContaining('tab=reports&metric=lateReturnRate'),
      { scroll: false },
    );
  });

  it('그 지표가 못 쓰는 축은 선택지에서 사라지고 쓸 수 있는 축으로 옮겨 간다', async () => {
    const asked = recordQueries();
    const { userEvent } = renderReports();
    await waitFor(() => expect(asked).toHaveLength(1));

    await userEvent.selectOptions(screen.getByLabelText('지표'), 'zoneOccupancy');

    // 존 점유율은 존별로만 — 400을 받는 조합이 화면에 남지 않는다
    await waitFor(() => expect(param(asked.at(-1)!, 'groupBy')).toBe('zone'));
    const groupBy = screen.getByLabelText('가르는 기준') as HTMLSelectElement;
    expect([...groupBy.options].map((o) => o.value)).toEqual(['zone']);
  });

  it('기간에 반응하지 않는 지표는 그 사실을 화면에 적는다', async () => {
    const { userEvent } = renderReports();
    await screen.findByText('리포트 조건');

    await userEvent.selectOptions(screen.getByLabelText('지표'), 'zoneOccupancy');

    expect(await screen.findByText(/기간과 무관한 현재 값이에요/)).toBeInTheDocument();
    expect(REPORT_METRIC_META.zoneOccupancy.periodSensitive).toBe(false);
  });

  it('기간 프리셋을 누르면 기간만 바뀌어 다시 묻는다', async () => {
    const asked = recordQueries();
    const { userEvent } = renderReports('tab=reports&metric=revenue&groupBy=day&from=2026-01-01&to=2026-01-31');
    await waitFor(() => expect(asked).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: '최근 7일' }));

    await waitFor(() => expect(asked.length).toBeGreaterThan(1));
    const latest = asked.at(-1)!;
    expect(param(latest, 'metric')).toBe('revenue'); // 지표는 그대로
    expect(param(latest, 'from')).not.toBe('2026-01-01');
    expect(screen.getByRole('button', { name: '최근 7일' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('존·차종 필터를 고르면 쿼리에 실린다 (선택지는 서버가 준다)', async () => {
    const asked = recordQueries();
    const { userEvent } = renderReports();
    await waitFor(() => expect(asked).toHaveLength(1));

    await screen.findByRole('option', { name: reportOptions.zones[0].name });
    await userEvent.selectOptions(screen.getByLabelText('존'), reportOptions.zones[0].id);
    await waitFor(() => expect(param(asked.at(-1)!, 'zoneId')).toBe(reportOptions.zones[0].id));

    await userEvent.selectOptions(screen.getByLabelText('차종'), reportOptions.models[0]);
    await waitFor(() => expect(param(asked.at(-1)!, 'model')).toBe(reportOptions.models[0]));
  });

  it('존·차종으로 가르면 가로 막대로 눕고 표도 같은 라벨을 쓴다', async () => {
    const asked = recordQueries();
    const { userEvent } = renderReports();
    await waitFor(() => expect(asked).toHaveLength(1));

    await userEvent.selectOptions(screen.getByLabelText('가르는 기준'), 'zone');

    await waitFor(() => expect(lastChart().config.options?.indexAxis).toBe('y'));
    expect(lastChart().config.type).toBe('bar');
    expect(lastChart().config.data.labels).toEqual(reportOptions.zones.map((z) => z.name));

    const table = within(panel('표')).getByRole('table');
    expect(within(table).getByText(reportOptions.zones[0].name)).toBeInTheDocument();
  });

  it('데이터가 0건이면 빈 캔버스가 아니라 문구가 선다', async () => {
    server.use(
      http.get(`${API}/ops/reports`, () =>
        HttpResponse.json({
          meta: {
            metric: 'revenue',
            groupBy: 'day',
            unit: 'krw',
            range: { from: '2026-08-01', to: '2026-08-03' },
            filters: { zoneId: null, model: null },
            total: 0,
          },
          rows: [],
        }),
      ),
    );
    renderReports();

    await waitFor(() =>
      expect(screen.getAllByText('이 조건에 해당하는 데이터가 없어요').length).toBeGreaterThan(0),
    );
    expect(chartInstances()).toHaveLength(0);
  });

  it('비율 지표의 전체 값은 가중 평균이라고 적어 둔다', async () => {
    const { userEvent } = renderReports();
    await screen.findByText('리포트 조건');

    await userEvent.selectOptions(screen.getByLabelText('지표'), 'utilization');

    expect(await screen.findByText('행 평균이 아닌 가중 평균')).toBeInTheDocument();
  });
});
