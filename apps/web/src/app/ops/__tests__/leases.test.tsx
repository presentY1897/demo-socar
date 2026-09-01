import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OpsLeasesPage from '@/app/ops/leases/page';
import { opsLeases } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const [pending, active] = opsLeases;

const renderOps = (user = MOCK_USERS.opsAdmin) =>
  renderWithProviders(<OpsLeasesPage />, { user, pathname: '/ops/leases' });

describe('/ops/leases — 운영 어드민의 리스 요청 처리', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('법인·차량과 함께 처리 대기 요청을 보여준다', async () => {
    renderOps();

    expect(await screen.findByText(/처리 대기 1건/)).toBeInTheDocument();
    expect(screen.getAllByText(pending.corporation.name).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(pending.vehicle.plateNo))).toBeInTheDocument();
    expect(screen.getByText('연장 요청 중')).toBeInTheDocument();
    expect(screen.getByText(/메모: 내년까지 계속 사용합니다/)).toBeInTheDocument();
    // 처리 대기가 아닌 계약에는 결정 버튼이 없다 (대기 1건 = 버튼 1쌍)
    expect(screen.getAllByRole('button', { name: '승인' })).toHaveLength(1);
    expect(active.status).toBe('ACTIVE');
  });

  it('승인은 approve 로, 반려는 사유와 함께 reject 로 간다', async () => {
    const calls: { path: string; body: unknown }[] = [];
    server.use(
      http.post(`${API}/ops/leases/:id/approve`, async ({ params, request }) => {
        calls.push({ path: `approve:${params.id}`, body: await request.json() });
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
      http.post(`${API}/ops/leases/:id/reject`, async ({ params, request }) => {
        calls.push({ path: `reject:${params.id}`, body: await request.json() });
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );

    const { userEvent } = renderOps();
    await userEvent.click(await screen.findByRole('button', { name: '승인' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: `approve:${pending.id}`, body: {} });

    vi.spyOn(window, 'prompt').mockReturnValue('차량 재고 회수 예정');
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({
      path: `reject:${pending.id}`,
      body: { reason: '차량 재고 회수 예정' },
    });
  });

  it('반려 사유를 비우면 요청을 보내지 않는다', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const { userEvent } = renderOps();
    // 핸들러가 없으므로 호출되면 MSW가 실패시킨다
    await userEvent.click(await screen.findByRole('button', { name: '반려' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('이미 처리된 요청이면 서버 사유를 그대로 보여준다', async () => {
    server.use(
      http.post(`${API}/ops/leases/:id/approve`, () =>
        HttpResponse.json({ message: '처리 대기 중인 요청이 아닙니다' }, { status: 409 }),
      ),
    );

    const { userEvent } = renderOps();
    await userEvent.click(await screen.findByRole('button', { name: '승인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('처리 대기 중인 요청이 아닙니다');
  });

  it('운영 어드민이 아니면 목록을 부르지 않고 안내만 보여준다', () => {
    for (const user of [MOCK_USERS.corpAdmin, MOCK_USERS.personal]) {
      const { unmount } = renderOps(user);
      expect(screen.getByText('운영 어드민 계정으로 로그인하세요')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
      unmount();
    }
  });
});
