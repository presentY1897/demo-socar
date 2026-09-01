import { describe, expect, it } from 'vitest';
import { AppShell } from '@/components/AppShell';
import { MOCK_USERS, renderWithProviders, screen } from '@/test/utils';

/** 핸들러는 이용자가 아니라 현장 작업자다 — 내비가 그 차이를 그대로 보여줘야 한다 */
describe('AppShell — 역할별 내비', () => {
  it('핸들러에게는 작업 탭만 보이고 예약·문의는 감춘다', () => {
    renderWithProviders(<AppShell>본문</AppShell>, {
      user: MOCK_USERS.handler,
      pathname: '/handler',
    });

    expect(screen.getByRole('link', { name: /작업/ })).toHaveAttribute('href', '/handler');
    expect(screen.queryByRole('link', { name: /예약/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /문의/ })).not.toBeInTheDocument();
  });

  it('개인 이용자에게는 작업 탭이 보이지 않는다', () => {
    renderWithProviders(<AppShell>본문</AppShell>, { user: MOCK_USERS.personal });

    expect(screen.getByRole('link', { name: /예약/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /작업/ })).not.toBeInTheDocument();
  });
});
