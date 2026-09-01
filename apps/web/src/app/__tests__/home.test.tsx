import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import HomePage from '@/app/page';
import { server } from '@/test/msw/server';
import { zoneMarkers } from '@/test/msw/fixtures';
import { renderWithProviders, screen, waitFor } from '@/test/utils';

// 지도는 leaflet(캔버스/DOM 측정)에 의존해 jsdom에서 의미가 없다 —
// 홈 화면의 관심사는 "존 목록을 받아 마커/리스트로 잇는가"이므로 지도만 대역으로 바꾼다.
vi.mock('@/components/ZoneMap', () => ({
  default: ({
    zones,
    onSelect,
  }: {
    zones: { id: string; name: string; vehicleCount: number }[];
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="zone-map">
      {zones.map((z) => (
        <button key={z.id} onClick={() => onSelect(z.id)}>
          {z.name} ({z.vehicleCount})
        </button>
      ))}
    </div>
  ),
}));

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

describe('홈 — 존 검색', () => {
  it('MSW 존 목록으로 지도 마커와 지역 점프 버튼을 렌더한다', async () => {
    renderWithProviders(<HomePage />);

    await waitFor(() => expect(screen.getByTestId('zone-map')).toBeInTheDocument());

    for (const z of zoneMarkers) {
      expect(await screen.findByText(new RegExp(z.name))).toBeInTheDocument();
    }
    // region → 한글 라벨
    expect(screen.getByRole('button', { name: '서울' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '부산' })).toBeInTheDocument();
  });

  it('존을 고르면 상세를 불러 바로 픽업/부름 차량을 구분해 보여준다', async () => {
    const { userEvent } = renderWithProviders(<HomePage />);

    await userEvent.click(await screen.findByRole('button', { name: /강남역 공영주차장/ }));

    expect(await screen.findByText('이 존에서 바로 이용')).toBeInTheDocument();
    expect(screen.getByText('아반떼')).toBeInTheDocument();
    expect(screen.getByText('18,000원')).toBeInTheDocument();

    expect(screen.getByText(/부름으로 가져와 이용/)).toBeInTheDocument();
    expect(screen.getByText('아이오닉 5')).toBeInTheDocument();
    expect(screen.getByText(/역삼역 주차장에서 배달 · 탁송 약 12분/)).toBeInTheDocument();
    expect(screen.getByText('24,000원')).toBeInTheDocument(); // 대여 18,000 + 부름 6,000
  });

  it('이용 가능한 차량이 없는 존은 빈 안내를 보여준다', async () => {
    const { userEvent } = renderWithProviders(<HomePage />);

    await userEvent.click(await screen.findByRole('button', { name: /서면역 환승주차장/ }));

    expect(await screen.findByText('이 시간에 이용 가능한 차량이 없어요')).toBeInTheDocument();
  });

  it('존 목록 요청에 선택한 이용 구간이 쿼리로 실린다', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/zones`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json(zoneMarkers);
      }),
    );

    renderWithProviders(<HomePage />);

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const params = seen[0].searchParams;
    const startAt = params.get('startAt')!;
    const endAt = params.get('endAt')!;
    expect(new Date(startAt).getTime()).toBeGreaterThan(Date.now());
    // 기본 구간은 2시간
    expect(new Date(endAt).getTime() - new Date(startAt).getTime()).toBe(2 * 60 * 60 * 1000);
    // 10분 단위로 올림된 시각
    expect(new Date(startAt).getUTCMinutes() % 10).toBe(0);
  });
});
