import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import DashboardPage from '@/app/dashboard/page';
import { server } from '@/test/msw/server';
import {
  metricsSummary,
  opsAccountingSummary,
  opsCandidates,
  opsTaskPendingLate,
  opsTasks,
  taskDeliveryOpen,
  taskRepositionUpcoming,
} from '@/test/msw/fixtures';
import { chartInstances } from '@/test/chart';
import { stubEventSource } from '@/test/sse';
import {
  MOCK_USERS,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@/test/utils';

vi.mock('@/components/ZoneMap', () => ({ default: () => <div data-testid="ops-map" /> }));

// 차트는 jsdom에 없는 캔버스 2D 컨텍스트를 요구한다 — 픽셀을 칠하는 부분만 대역으로 세우면
// 회계/배차 화면이 실제 래퍼(ChartCanvas)를 통해 무엇을 그리는지 설정 객체로 확인할 수 있다.
vi.mock('@/components/charts/chart-lib', async () => (await import('@/test/chart')).chartLibMock());

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const renderOps = (searchParams: string) => {
  stubEventSource();
  return renderWithProviders(<DashboardPage />, {
    user: MOCK_USERS.opsAdmin,
    pathname: '/dashboard',
    searchParams,
  });
};

const panel = (title: string) => screen.getByText(title).closest('section') as HTMLElement;

describe('운영 센터 — ③ 작업/배차', () => {
  it('미배정 큐 · 진행 중 보드 · 핸들러별 오늘 처리량을 한 응답으로 가른다', async () => {
    renderOps('tab=dispatch');

    await screen.findByText('미배정 작업');
    const queue = panel('미배정 작업');
    expect(within(queue).getByText(/회사 정문 앞/)).toBeInTheDocument();
    expect(within(queue).getAllByRole('button', { name: '배정' })).toHaveLength(1);

    const board = panel('진행 중');
    expect(within(board).getAllByText('한기사')).toHaveLength(2); // ASSIGNED 2건
    expect(within(board).getAllByText('배정됨')).toHaveLength(2);

    const throughput = panel('핸들러별 오늘 처리량');
    expect(within(throughput).getByText(/오늘 완료/)).toBeInTheDocument();
  });

  it('처리량은 가로 누적 막대로도 그린다 (완료 + 진행 중)', async () => {
    renderOps('tab=dispatch');

    await screen.findByText('핸들러별 오늘 처리량');
    await waitFor(() => expect(chartInstances()).toHaveLength(1));

    const chart = chartInstances()[0].config;
    expect(chart.type).toBe('bar');
    expect(chart.options?.indexAxis).toBe('y'); // 이름이 길어 눕힌다
    expect(chart.data.datasets.map((d) => d.label)).toEqual(['오늘 완료', '진행 중']);
    expect(chart.data.labels).toEqual(['한기사']);
  });

  it('배정 모달은 서버가 준 추천 순서를 그대로 보여준다', async () => {
    const { userEvent } = renderOps('tab=dispatch');

    await userEvent.click(await screen.findByRole('button', { name: '배정' }));

    const modal = await screen.findByRole('dialog', { name: '핸들러 배정' });
    const names = within(modal)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(names[0]).toContain(opsCandidates[0].name);
    expect(names[1]).toContain(opsCandidates[1].name);
    expect(names[2]).toContain(opsCandidates[2].name);
    // 점수 대신 근거 문장을 보여준다
    expect(within(modal).getByText(/강남역 공영주차장에서 0.4km/)).toBeInTheDocument();
    expect(within(modal).getByText(/완주 기록이 없어 거리를 알 수 없음/)).toBeInTheDocument();
  });

  it('배정하면 handlerId만 담아 보내고 큐에서 빠진다', async () => {
    let body: unknown;
    let assigned = false;
    server.use(
      http.get(`${API}/ops/tasks`, () =>
        HttpResponse.json(
          assigned
            ? opsTasks.map((t) =>
                t.id === taskDeliveryOpen.id
                  ? { ...t, status: 'ASSIGNED', assigneeId: 'user-handler-2', assigneeName: '이기사' }
                  : t,
              )
            : opsTasks,
        ),
      ),
      http.post(`${API}/ops/tasks/:id/assign`, async ({ request }) => {
        body = await request.json();
        assigned = true;
        return HttpResponse.json({ ...taskDeliveryOpen, status: 'ASSIGNED' }, { status: 201 });
      }),
    );
    const { userEvent } = renderOps('tab=dispatch');

    await userEvent.click(await screen.findByRole('button', { name: '배정' }));
    const modal = await screen.findByRole('dialog', { name: '핸들러 배정' });
    const second = within(modal).getAllByRole('listitem')[1];
    await userEvent.click(within(second).getByRole('button', { name: '배정' }));

    await waitFor(() => expect(body).toEqual({ handlerId: 'user-handler-2' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '핸들러 배정' })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(within(panel('미배정 작업')).queryByRole('button', { name: '배정' })).toBeNull(),
    );
  });

  it('이동을 시작하기 전인 작업은 재배정할 수 있다', async () => {
    const { userEvent } = renderOps('tab=dispatch');

    await userEvent.click((await screen.findAllByRole('button', { name: '재배정' }))[0]);

    expect(await screen.findByRole('dialog', { name: '핸들러 배정' })).toBeInTheDocument();
  });

  it('재배치 작업 생성은 출발 존을 보내지 않는다 — 차량이 서 있는 곳을 서버가 채운다', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/ops/tasks`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...opsTaskPendingLate, id: 'task-new' }, { status: 201 });
      }),
    );
    const { userEvent } = renderOps('tab=dispatch');

    await userEvent.click(await screen.findByRole('button', { name: '새 작업' }));
    const form = screen.getByRole('form', { name: '재배치 작업 생성' });
    await within(form).findByRole('option', { name: /아반떼/ });

    await userEvent.selectOptions(within(form).getByLabelText('차량'), 'veh-avante');
    await userEvent.selectOptions(within(form).getByLabelText('도착 존'), 'zone-yeoksam');
    await userEvent.click(within(form).getByRole('button', { name: '재배치 작업 만들기' }));

    await waitFor(() =>
      expect(body).toMatchObject({ vehicleId: 'veh-avante', toZoneId: 'zone-yeoksam' }),
    );
    expect(body).not.toHaveProperty('fromZoneId');
    expect(String(body!.dueAt)).toMatch(/T18:00:00\+09:00$/);
  });

  it('출발과 도착이 같은 존이면 요청 없이 막는다', async () => {
    let called = false;
    server.use(
      http.post(`${API}/ops/tasks`, () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const { userEvent } = renderOps('tab=dispatch');

    await userEvent.click(await screen.findByRole('button', { name: '새 작업' }));
    const form = screen.getByRole('form', { name: '재배치 작업 생성' });
    await within(form).findByRole('option', { name: /아반떼/ });

    await userEvent.selectOptions(within(form).getByLabelText('차량'), 'veh-avante');
    await userEvent.selectOptions(within(form).getByLabelText('도착 존'), 'zone-gangnam');
    await userEvent.click(within(form).getByRole('button', { name: '재배치 작업 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('출발과 도착이 같은 존이에요');
    expect(called).toBe(false);
  });
});

describe('운영 센터 — ⑥ 회계', () => {
  it('손익 카드가 API 값과 그대로 맞는다', async () => {
    renderOps('tab=accounting');

    expect(await screen.findByText('5,700,000원')).toBeInTheDocument(); // 매출 합계
    expect(screen.getByText('4,120,000원')).toBeInTheDocument(); // 비용 합계
    expect(screen.getByText(`${opsAccountingSummary.marginPct}%`)).toBeInTheDocument();
    // 손익 = 매출 − 비용
    expect(opsAccountingSummary.revenue.totalKrw - opsAccountingSummary.cost.totalKrw).toBe(
      opsAccountingSummary.profitKrw,
    );
    expect(screen.getAllByText('1,580,000원').length).toBeGreaterThan(0);
  });

  it('비용 세 갈래를 비율과 함께 보여주고 합이 총비용과 같다', async () => {
    renderOps('tab=accounting');

    await screen.findByText('비용 구성');
    const costs = panel('비용 구성');
    expect(within(costs).getByText('차량 리스료')).toBeInTheDocument();
    expect(within(costs).getByText('보험료')).toBeInTheDocument();
    expect(within(costs).getByText('주차장 계약비')).toBeInTheDocument();

    const { vehicleLeaseKrw, insuranceKrw, zoneContractKrw, totalKrw } = opsAccountingSummary.cost;
    expect(vehicleLeaseKrw + insuranceKrw + zoneContractKrw).toBe(totalKrw);
  });

  it('운영 홈에서 옮겨 온 지표와 일별 차트가 이 탭에 있다', async () => {
    renderOps('tab=accounting');

    expect(await screen.findByText(`${metricsSummary.reservationCount}건`)).toBeInTheDocument();
    expect(screen.getByText(`${metricsSummary.utilizationPct}%`)).toBeInTheDocument();
    expect(screen.getByText(`${metricsSummary.lateReturnPct}%`)).toBeInTheDocument();
    // 일별 차트 2개(예약 막대 · 매출 선)가 지표 응답 14일치를 그대로 받는다
    await waitFor(() => expect(chartInstances()).toHaveLength(2));
    expect(chartInstances().map((c) => c.config.type)).toEqual(['bar', 'line']);
    expect(chartInstances()[0].config.data.labels).toHaveLength(14);
  });

  it('기간을 바꾸면 매출 집계만 다시 묻는다 (비용은 월 고정비)', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/ops/accounting/summary`, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('days') ?? '');
        return HttpResponse.json(opsAccountingSummary);
      }),
    );
    const { userEvent } = renderOps('tab=accounting');

    await screen.findByText('비용 구성');
    await userEvent.click(screen.getByRole('button', { name: '최근 90일' }));

    await waitFor(() => expect(asked).toContain('90'));
    expect(screen.getByText('비용은 월 고정비라 기간을 바꿔도 그대로예요')).toBeInTheDocument();
  });

  it('운영 홈에는 매출·손익이 남아 있지 않다', async () => {
    renderOps('');

    await screen.findByText('지금 운행 중');
    expect(screen.queryByText(/매출/)).not.toBeInTheDocument();
    expect(screen.queryByText('손익')).not.toBeInTheDocument();
    expect(screen.queryByText('차량 가동률')).not.toBeInTheDocument();
    expect(chartInstances()).toHaveLength(0); // 운영 홈에는 차트가 없다
  });
});

/** 진행 중 보드가 기한 순인지 — 정렬은 순수 함수(lib/ops-tasks)가 하고 여기선 결과만 본다 */
describe('작업 보드 정렬', () => {
  it('진행 중 작업은 기한이 이른 순으로 놓인다', async () => {
    renderOps('tab=dispatch');

    await screen.findByText('진행 중');
    const board = panel('진행 중');
    const text = board.textContent ?? '';
    expect(text.indexOf(taskRepositionUpcoming.to.label)).toBeGreaterThan(-1);
  });
});
