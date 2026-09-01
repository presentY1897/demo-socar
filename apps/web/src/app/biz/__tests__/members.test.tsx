import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import BizMembersPage from '@/app/biz/members/page';
import { corpMembers } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** MANAGER(박배차) 본인 행 — 자기 강등 금지라 화면에서도 잠겨 있다 */
const self = corpMembers.find((m) => m.isSelf)!;
const viewer = corpMembers.find((m) => m.corpGrade === 'VIEWER')!;

describe('/biz/members — 등급 관리 (MANAGER)', () => {
  it('멤버 목록을 이름·이메일·등급과 함께 보여준다', async () => {
    renderWithProviders(<BizMembersPage />, {
      user: MOCK_USERS.corpAdmin,
      pathname: '/biz/members',
    });

    expect(await screen.findByText(viewer.name)).toBeInTheDocument();
    expect(screen.getByText(viewer.email)).toBeInTheDocument();
    for (const m of corpMembers) {
      expect(screen.getByRole('combobox', { name: `${m.name} 등급` })).toHaveValue(m.corpGrade);
    }
  });

  it('등급 변경 시 PATCH /biz/members/:id/grade 로 새 등급만 보낸다', async () => {
    let sent: { id: string; body: unknown } | undefined;
    server.use(
      http.patch(`${API}/biz/members/:id/grade`, async ({ params, request }) => {
        sent = { id: String(params.id), body: await request.json() };
        return HttpResponse.json({ ...viewer, corpGrade: 'APPROVER' });
      }),
    );

    const { userEvent } = renderWithProviders(<BizMembersPage />, {
      user: MOCK_USERS.corpAdmin,
      pathname: '/biz/members',
    });

    const select = await screen.findByRole('combobox', { name: `${viewer.name} 등급` });
    await userEvent.selectOptions(select, 'APPROVER');

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toEqual({ id: viewer.id, body: { grade: 'APPROVER' } });
  });

  it('본인 행은 등급 변경이 잠기고 사유가 보인다 (관리자 0명 방지)', async () => {
    renderWithProviders(<BizMembersPage />, {
      user: MOCK_USERS.corpAdmin,
      pathname: '/biz/members',
    });

    const mine = await screen.findByRole('combobox', { name: `${self.name} 등급` });
    expect(mine).toBeDisabled();
    expect(mine).toHaveAttribute('title', expect.stringContaining('본인 등급은 바꿀 수 없어요'));
    expect(screen.getByText(/관리자가 0명이 되는 걸 막기 위해서예요/)).toBeInTheDocument();
  });

  it('서버가 거절하면 사유를 그대로 보여준다', async () => {
    server.use(
      http.patch(`${API}/biz/members/:id/grade`, () =>
        HttpResponse.json({ message: '본인 등급은 낮출 수 없습니다' }, { status: 400 }),
      ),
    );

    const { userEvent } = renderWithProviders(<BizMembersPage />, {
      user: MOCK_USERS.corpAdmin,
      pathname: '/biz/members',
    });

    const select = await screen.findByRole('combobox', { name: `${viewer.name} 등급` });
    await userEvent.selectOptions(select, 'MANAGER');

    expect(await screen.findByRole('alert')).toHaveTextContent('본인 등급은 낮출 수 없습니다');
  });

  it('manageMembers 권한이 없으면 목록 대신 필요한 등급을 안내한다', async () => {
    for (const user of [MOCK_USERS.corpViewer, MOCK_USERS.corpMember, MOCK_USERS.corpApprover]) {
      const { unmount } = renderWithProviders(<BizMembersPage />, {
        user,
        pathname: '/biz/members',
      });

      expect(screen.getByText('접근 권한이 없어요')).toBeInTheDocument();
      expect(screen.getByText(/필요 등급: 관리자/)).toBeInTheDocument();
      // 목록 자체를 부르지 않는다 (렌더되는 멤버 이름이 없다)
      expect(screen.queryByText(viewer.email)).not.toBeInTheDocument();
      unmount();
    }
  });
});
