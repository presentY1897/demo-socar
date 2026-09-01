import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { VehicleManualView } from '@/components/VehicleManualView';
import { server } from '@/test/msw/server';
import { manualAvante, manualIoniq } from '@/test/msw/fixtures';
import { renderWithProviders, screen } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// 페이지(`app/vehicles/[id]/manual/page.tsx`)는 `useParams()`만 하는 래퍼라 화면 본체를 직접 렌더한다
const renderManual = (id: string) =>
  renderWithProviders(<VehicleManualView id={id} />, { pathname: `/vehicles/${id}/manual` });

/** 아코디언 헤더(제목 버튼) */
const header = (title: string) => screen.getByRole('button', { name: new RegExp(title) });

describe('차종 매뉴얼 페이지', () => {
  it('차량 정보와 섹션 아코디언을 렌더한다 — 첫 섹션만 펼쳐진 상태', async () => {
    renderManual(manualAvante.vehicleId);

    expect(await screen.findByText('아반떼')).toBeInTheDocument();
    expect(screen.getByText(manualAvante.tagline)).toBeInTheDocument();
    expect(screen.getByText('가솔린')).toBeInTheDocument();

    for (const s of manualAvante.sections) {
      expect(header(s.title)).toBeInTheDocument();
    }
    expect(header('시동 걸기')).toHaveAttribute('aria-expanded', 'true');
    expect(header('주유 · 충전')).toHaveAttribute('aria-expanded', 'false');

    // 펼쳐진 섹션의 본문만 보인다
    expect(screen.getByText(manualAvante.sections[0].body)).toBeInTheDocument();
    expect(screen.queryByText(manualAvante.sections[1].body)).not.toBeInTheDocument();
  });

  it('다른 섹션을 누르면 그 본문이 열리고 이전 섹션은 닫힌다', async () => {
    const { userEvent } = renderManual(manualAvante.vehicleId);

    await userEvent.click(await screen.findByRole('button', { name: /반납 전 체크리스트/ }));

    expect(screen.getByText(/연료 게이지 1\/4 이상/)).toBeInTheDocument();
    expect(screen.queryByText(manualAvante.sections[0].body)).not.toBeInTheDocument();
    expect(header('시동 걸기')).toHaveAttribute('aria-expanded', 'false');

    // 열린 섹션을 다시 누르면 접힌다
    await userEvent.click(header('반납 전 체크리스트'));
    expect(screen.queryByText(/연료 게이지 1\/4 이상/)).not.toBeInTheDocument();
  });

  it('전기차는 같은 섹션에 충전 안내가 뜬다 (내연기관과 다른 콘텐츠)', async () => {
    const { userEvent, unmount } = renderManual(manualIoniq.vehicleId);

    expect(await screen.findByText('아이오닉 5')).toBeInTheDocument();
    expect(screen.getByText('전기차')).toBeInTheDocument();
    expect(screen.getByText(/READY 표시가 뜹니다/)).toBeInTheDocument();

    await userEvent.click(header('주유 · 충전'));
    expect(screen.getByText(/충전구는 조수석 뒤편/)).toBeInTheDocument();
    expect(screen.queryByText(/주유구는 조수석 뒤편/)).not.toBeInTheDocument();

    await userEvent.click(header('반납 전 체크리스트'));
    expect(screen.getByText(/배터리 잔량 30% 이상/)).toBeInTheDocument();
    unmount();

    // 같은 섹션 제목에 내연기관은 주유 안내가 온다
    const { userEvent: ue2 } = renderManual(manualAvante.vehicleId);
    await ue2.click(await screen.findByRole('button', { name: /주유 · 충전/ }));
    expect(screen.getByText(/주유구는 조수석 뒤편/)).toBeInTheDocument();
    expect(screen.queryByText(/충전구는 조수석 뒤편/)).not.toBeInTheDocument();
  });

  it('없는 차량이면 서버 안내와 뒤로 가기를 보여준다', async () => {
    server.use(
      http.get(`${API}/vehicles/:id/manual`, () =>
        HttpResponse.json({ message: '차량을 찾을 수 없습니다' }, { status: 404 }),
      ),
    );

    const { router, userEvent } = renderManual('veh-unknown');

    expect(await screen.findByText('차량을 찾을 수 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /시동 걸기/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '뒤로 가기' }));
    expect(router.back).toHaveBeenCalled();
  });
});
