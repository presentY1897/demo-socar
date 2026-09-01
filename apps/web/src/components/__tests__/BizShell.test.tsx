import { describe, expect, it } from 'vitest';
import { AppShell } from '@/components/AppShell';
import { MOCK_USERS, renderWithProviders, screen } from '@/test/utils';

/**
 * `/biz`는 소비자 앱과 분리된 서비스 셸(BizShell)을 쓴다 —
 * 루트 레이아웃은 그대로 두고 경로로만 갈라지므로 그 분기를 검증한다.
 */
describe('BizShell — 분리된 비즈니스 셸', () => {
  it('/biz 경로에서는 비즈니스 브랜딩과 전용 내비가 뜬다 (소비자 내비 없음)', () => {
    renderWithProviders(<AppShell>본문</AppShell>, {
      user: MOCK_USERS.corpMember,
      pathname: '/biz/dispatch',
    });

    expect(screen.getByText('비즈니스')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /배차/ })).toHaveAttribute('href', '/biz/dispatch');
    // 소비자 앱 내비(홈/예약)는 비즈니스 셸에 없다
    expect(screen.queryByRole('link', { name: /홈/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /예약/ })).not.toBeInTheDocument();
    // 개인 이용으로 돌아가는 길은 남긴다
    expect(screen.getByRole('link', { name: '일반 서비스' })).toHaveAttribute('href', '/');
  });

  it('임직원에게는 보드 탭이 없고 배차 담당자에게만 보인다', () => {
    const { unmount } = renderWithProviders(<AppShell>본문</AppShell>, {
      user: MOCK_USERS.corpMember,
      pathname: '/biz/dispatch',
    });
    expect(screen.queryByRole('link', { name: /보드/ })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<AppShell>본문</AppShell>, {
      user: MOCK_USERS.corpAdmin,
      pathname: '/biz/dispatch',
    });
    expect(screen.getByRole('link', { name: /보드/ })).toHaveAttribute('href', '/biz/board');
  });

  it('법인 계정이 아니면 본문 대신 안내를 보여준다', () => {
    renderWithProviders(<AppShell>비밀 본문</AppShell>, {
      user: MOCK_USERS.personal,
      pathname: '/biz/dispatch',
    });
    expect(screen.queryByText('비밀 본문')).not.toBeInTheDocument();
    expect(screen.getByText(/법인 계정으로 로그인하면/)).toBeInTheDocument();
  });

  it('소비자 경로에서는 기존 앱 셸이 그대로 뜨고, 법인 계정에는 비즈니스 진입 탭이 있다', () => {
    renderWithProviders(<AppShell>본문</AppShell>, {
      user: MOCK_USERS.corpAdmin,
      pathname: '/',
    });
    expect(screen.getByRole('link', { name: /홈/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /비즈니스/ })).toHaveAttribute('href', '/biz');
    expect(screen.getByText('본문')).toBeInTheDocument();
  });
});
