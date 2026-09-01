import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import BizDispatchPage from '@/app/biz/dispatch/page';
import { dispatchRecommended } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** M5-2에서 `/office` → `/biz/dispatch`로 옮기면서 API도 `/biz/dispatch/*`로 바뀌었다 */
describe('/biz/dispatch — 법인 배차', () => {
  it('임직원: 내 요청 목록과 추천 후보 근거가 보인다', async () => {
    renderWithProviders(<BizDispatchPage />, {
      user: MOCK_USERS.corpMember,
      pathname: '/biz/dispatch',
    });

    expect(await screen.findByText(dispatchRecommended.purpose)).toBeInTheDocument();
    expect(screen.getByText(/아반떼/)).toBeInTheDocument();
    expect(screen.getByText('· 법인 전용 차량')).toBeInTheDocument();
    // 승인 버튼은 담당자 전용
    expect(screen.queryByRole('button', { name: '이 차량으로 승인' })).not.toBeInTheDocument();
  });

  it('요청 생성 시 /biz/dispatch/requests 로 목적·희망 구간을 보낸다', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/biz/dispatch/requests`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(dispatchRecommended, { status: 201 });
      }),
    );

    const { userEvent } = renderWithProviders(<BizDispatchPage />, {
      user: MOCK_USERS.corpMember,
      pathname: '/biz/dispatch',
    });

    await userEvent.type(screen.getByPlaceholderText(/사용 목적/), '본사 출장');
    await userEvent.click(screen.getByRole('button', { name: '요청하고 추천받기' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({ purpose: '본사 출장' });
    const sent = body as { desiredStartAt: string; desiredEndAt: string };
    expect(new Date(sent.desiredStartAt).getTime()).toBeLessThan(
      new Date(sent.desiredEndAt).getTime(),
    );
  });

  it('배차 담당자: 후보를 골라 승인하면 승인 API로 후보 id가 간다', async () => {
    let approvedWith: unknown;
    server.use(
      http.post(`${API}/biz/dispatch/requests/:id/approve`, async ({ request, params }) => {
        approvedWith = { id: params.id, body: await request.json() };
        return HttpResponse.json({ ...dispatchRecommended, status: 'APPROVED' });
      }),
    );

    const { userEvent } = renderWithProviders(<BizDispatchPage />, {
      user: MOCK_USERS.corpAdmin,
      pathname: '/biz/dispatch',
    });

    await userEvent.click(await screen.findByRole('button', { name: '이 차량으로 승인' }));

    await waitFor(() => expect(approvedWith).toBeDefined());
    expect(approvedWith).toEqual({
      id: dispatchRecommended.id,
      body: { candidateId: dispatchRecommended.candidates[0].id },
    });
  });

  it('요청이 실패하면 서버 메시지를 그대로 보여준다', async () => {
    server.use(
      http.post(`${API}/biz/dispatch/requests`, () =>
        HttpResponse.json({ message: '과거 시각으로는 요청할 수 없습니다' }, { status: 400 }),
      ),
    );

    const { userEvent } = renderWithProviders(<BizDispatchPage />, {
      user: MOCK_USERS.corpMember,
      pathname: '/biz/dispatch',
    });

    await userEvent.type(screen.getByPlaceholderText(/사용 목적/), '테스트');
    await userEvent.click(screen.getByRole('button', { name: '요청하고 추천받기' }));

    expect(await screen.findByText('과거 시각으로는 요청할 수 없습니다')).toBeInTheDocument();
  });
});
