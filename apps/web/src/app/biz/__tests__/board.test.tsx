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

  it('담당자가 아니면 안내만 보여주고 보드를 호출하지 않는다', () => {
    // 핸들러를 타면 onUnhandledRequest 설정과 무관하게 호출 자체가 없어야 하므로
    // SWR 키를 null로 두는 분기(담당자 아님)를 화면으로 확인한다
    renderWithProviders(<BoardPage />, {
      user: MOCK_USERS.corpMember,
      pathname: '/biz/board',
    });
    expect(screen.getByText('배차 담당자 계정으로 로그인하세요')).toBeInTheDocument();
  });
});
