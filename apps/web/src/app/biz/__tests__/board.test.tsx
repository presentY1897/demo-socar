import { describe, expect, it } from 'vitest';
import BoardPage from '@/app/biz/board/page';
import { dispatchBoard } from '@/test/msw/fixtures';
import { MOCK_USERS, renderWithProviders, screen } from '@/test/utils';

describe('/biz/board — 배차 타임라인', () => {
  it('배차 담당자에게 오피스·차량·대기 요청이 보인다', async () => {
    renderWithProviders(<BoardPage />, {
      user: MOCK_USERS.corpAdmin,
      pathname: '/biz/board',
    });

    expect(await screen.findByText(`${dispatchBoard.office.name} 인근 3km 차량`)).toBeInTheDocument();
    expect(screen.getByText(dispatchBoard.vehicles[0].modelName)).toBeInTheDocument();
    // 대기 요청 칩 + 타임라인 막대 양쪽에 목적이 표기된다
    expect(screen.getAllByText(dispatchBoard.requests[0].purpose).length).toBeGreaterThan(0);
  });

  it('viewBoard 권한이 없으면 안내만 보여주고 보드를 호출하지 않는다', () => {
    // 게이트가 본문 자체를 렌더하지 않으므로 SWR 호출도 일어나지 않는다
    // (핸들러를 타면 MSW의 onUnhandledRequest와 무관하게 화면이 달라진다)
    renderWithProviders(<BoardPage />, {
      user: MOCK_USERS.corpMember,
      pathname: '/biz/board',
    });
    expect(screen.getByText('접근 권한이 없어요')).toBeInTheDocument();
  });
});
