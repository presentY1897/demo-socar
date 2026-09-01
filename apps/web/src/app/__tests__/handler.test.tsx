import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { HandlerQueueRes, HandlerTaskRes } from '@socar/shared';
import HandlerPage from '@/app/handler/page';
import { server } from '@/test/msw/server';
import { emptyHandlerQueue, handlerQueue, taskRetrieveMine } from '@/test/msw/fixtures';
import { jpegFile, stubImagePipeline } from '@/test/image';
import { MOCK_USERS, renderWithProviders, screen, waitFor, within } from '@/test/utils';

// 지도는 leaflet(캔버스/DOM 측정)에 의존해 jsdom에서 의미가 없다 —
// 이 화면의 관심사는 큐와 상태 전환이므로 지도만 대역으로 바꾼다.
vi.mock('@/components/TaskRouteMap', () => ({
  default: ({ from, to }: { from: { label: string }; to: { label: string } }) => (
    <div data-testid="task-route-map">
      {from.label} → {to.label}
    </div>
  ),
}));

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const render = () => renderWithProviders(<HandlerPage />, { user: MOCK_USERS.handler, pathname: '/handler' });

/**
 * 상태를 들고 있는 목 서버 — 전이 후 큐가 실제로 바뀌는 흐름을 검증한다.
 * 전이 규칙 자체는 API 통합 테스트(M2-3)가 지키고, 여기서는 화면이 갱신을 반영하는지 본다.
 */
function statefulQueue(initial: HandlerQueueRes = handlerQueue) {
  const state: HandlerQueueRes = JSON.parse(JSON.stringify(initial)) as HandlerQueueRes;
  const bodies: Record<string, unknown> = {};

  const find = (id: string): HandlerTaskRes | undefined =>
    [...state.today, ...state.upcoming, ...state.open, ...state.done].find((t) => t.id === id);
  const drop = (id: string) => {
    state.today = state.today.filter((t) => t.id !== id);
    state.upcoming = state.upcoming.filter((t) => t.id !== id);
    state.open = state.open.filter((t) => t.id !== id);
  };

  server.use(
    http.get(`${API}/handler/tasks`, () => HttpResponse.json(state)),

    http.post(`${API}/handler/tasks/:id/accept`, ({ params }) => {
      const task = find(String(params.id))!;
      drop(task.id);
      state.today.push({ ...task, status: 'ASSIGNED', assigneeId: 'user-handler', assigneeName: '한기사' });
      return HttpResponse.json(state.today.at(-1), { status: 201 });
    }),

    http.post(`${API}/handler/tasks/:id/start`, ({ params }) => {
      const task = find(String(params.id))!;
      Object.assign(task, { status: 'EN_ROUTE', startedAt: new Date().toISOString() });
      return HttpResponse.json(task, { status: 201 });
    }),

    http.post(`${API}/handler/tasks/:id/complete`, async ({ params, request }) => {
      bodies.complete = await request.json();
      const task = find(String(params.id))!;
      drop(task.id);
      const done = {
        ...task,
        status: 'DONE' as const,
        completedAt: new Date().toISOString(),
        completionNote: (bodies.complete as { note: string }).note,
      };
      state.done.unshift(done);
      return HttpResponse.json(done, { status: 201 });
    }),
  );

  return bodies;
}

describe('/handler — 핸들러 작업 큐', () => {
  it('오늘 작업과 공개 작업을 타입 배지·지연 경고와 함께 보여준다', async () => {
    render();

    expect(await screen.findByText('오늘 할 일')).toBeInTheDocument();
    // 회수(내 오늘 작업) — 기한이 지나 지연 경고가 붙는다
    expect(screen.getByText('↩️ 회수')).toBeInTheDocument();
    expect(screen.getByText('⏰ 지연')).toBeInTheDocument();
    // 배달(공개 작업) — 출발 존 → 수령지 좌표 라벨
    expect(screen.getByText('🚚 배달')).toBeInTheDocument();
    expect(screen.getAllByText('회사 정문 앞').length).toBeGreaterThan(0);
    expect(screen.getAllByText('강남역 공영주차장').length).toBeGreaterThan(0);
    // 예정 작업은 별도 구획
    expect(screen.getByText('예정')).toBeInTheDocument();
    expect(screen.getByText('🔁 재배치')).toBeInTheDocument();
    // 공개 작업에만 카드에서 바로 누르는 수락 버튼이 붙는다
    expect(screen.getByRole('button', { name: '수락' })).toBeInTheDocument();
  });

  it('공개 작업을 수락하면 내 오늘 목록으로 옮겨간다', async () => {
    statefulQueue();
    const { userEvent } = render();

    await userEvent.click(await screen.findByRole('button', { name: '수락' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '수락' })).not.toBeInTheDocument(),
    );
    const openSection = screen.getByText('수락 가능한 작업').parentElement!;
    expect(within(openSection).getByText(/새 작업이 생기면/)).toBeInTheDocument();
    // 배달 작업이 오늘 할 일로 넘어왔다
    const todaySection = screen.getByText('오늘 할 일').parentElement!;
    expect(within(todaySection).getByText('🚚 배달')).toBeInTheDocument();
  });

  it('상세에서 이동 시작 → 완료까지 진행하고, 완료 요청에 사진·메모를 실어 보낸다', async () => {
    stubImagePipeline({ bytesPerStep: [150 * 1024] });
    const bodies = statefulQueue();
    const { userEvent } = render();

    await userEvent.click(await screen.findByRole('button', { name: '회수 작업 상세 열기' }));
    const dialog = screen.getByRole('dialog', { name: '작업 상세' });
    expect(within(dialog).getByTestId('task-route-map')).toHaveTextContent('회사 정문 앞 → 강남역');
    expect(within(dialog).getByText(/약 9분/)).toBeInTheDocument();

    // 배정 상태에서는 다음 동작이 "이동 시작" 하나뿐이다
    expect(within(dialog).queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '이동 시작' }));

    // 이동 중이 되면 같은 자리에 완료 입력이 열린다 — 사진·메모가 없으면 서버에 가기 전에 막힌다
    await screen.findByLabelText('인계 사진');
    await userEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('인계 메모를 남겨 주세요');

    await userEvent.type(screen.getByLabelText('인계 메모'), '지하 2층 B-14 주차 완료');
    await userEvent.click(screen.getByRole('button', { name: '완료 처리' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('사진을 최소 1장 첨부해 주세요');

    await userEvent.upload(screen.getByLabelText('인계 사진'), jpegFile());
    await waitFor(() => expect(screen.getByTestId('photo-count')).toHaveTextContent('1/5'));
    await userEvent.click(screen.getByRole('button', { name: '완료 처리' }));

    await waitFor(() => expect(bodies.complete).toBeDefined());
    expect(bodies.complete).toMatchObject({
      note: '지하 2층 B-14 주차 완료',
      photos: [{ mime: 'image/jpeg' }],
    });

    // 완료하면 상세가 닫히고 이력 탭으로 넘어간다
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('오늘 완료')).toBeInTheDocument();
    expect(screen.getAllByText(/지하 2층 B-14 주차 완료/).length).toBeGreaterThan(0);
  });

  it('완료 이력은 오늘과 이번 주로 나뉜다', async () => {
    const { userEvent } = render();

    await userEvent.click(await screen.findByRole('button', { name: /완료 이력/ }));

    const todayDone = screen.getByText('오늘 완료').parentElement!;
    expect(within(todayDone).getByText(/지하 2층 B-14 주차 완료/)).toBeInTheDocument();
    const weekDone = screen.getByText('이번 주').parentElement!;
    expect(within(weekDone).getByText(/지하 2층 B-14 주차 완료/)).toBeInTheDocument();
  });

  it('작업이 하나도 없으면 각 구획이 빈 안내를 보여준다', async () => {
    server.use(http.get(`${API}/handler/tasks`, () => HttpResponse.json(emptyHandlerQueue)));
    render();

    expect(await screen.findByText('오늘 배정된 작업이 없어요')).toBeInTheDocument();
    expect(screen.getByText(/새 작업이 생기면/)).toBeInTheDocument();
  });

  it('핸들러가 아닌 계정은 화면 대신 안내를 본다', async () => {
    renderWithProviders(<HandlerPage />, { user: MOCK_USERS.personal, pathname: '/handler' });

    expect(
      await screen.findByText('핸들러(운송기사) 계정만 볼 수 있는 화면이에요'),
    ).toBeInTheDocument();
    // 큐를 부르지도 그리지도 않는다 (SWR 키가 null)
    expect(screen.queryByText('오늘 할 일')).not.toBeInTheDocument();
    expect(screen.queryByText(taskRetrieveMine.to.label)).not.toBeInTheDocument();
  });

  it('비로그인 상태에서는 로그인 안내를 본다', async () => {
    renderWithProviders(<HandlerPage />, { pathname: '/handler' });
    expect(await screen.findByText('로그인 후 이용할 수 있어요')).toBeInTheDocument();
  });
});
