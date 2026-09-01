import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BizFleetDetailPage from '@/app/biz/fleet/[id]/page';
import BizFleetPage from '@/app/biz/fleet/page';
import { fleetList, fleetVehicleDetail } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const [ioniq, carnival] = fleetList.items;
const lease = fleetVehicleDetail.lease!;

/** 상세는 라우트 파라미터(useParams)를 읽는다 */
const renderDetail = (user = MOCK_USERS.corpAdmin, id = fleetVehicleDetail.id) =>
  renderWithProviders(<BizFleetDetailPage />, {
    user,
    pathname: `/biz/fleet/${id}`,
    params: { id },
  });

describe('/biz/fleet — 법인 플릿 목록', () => {
  it('월 총 리스 비용과 차량별 만기·이용률을 보여준다', async () => {
    renderWithProviders(<BizFleetPage />, { user: MOCK_USERS.corpAdmin, pathname: '/biz/fleet' });

    expect(await screen.findByText('1,580,000원')).toBeInTheDocument();
    expect(screen.getByText(/차량 2대 · 계약 중 2건/)).toBeInTheDocument();
    expect(screen.getByText(ioniq.modelName)).toBeInTheDocument();
    expect(screen.getByText(carnival.modelName)).toBeInTheDocument();
    expect(screen.getByText(/40% · 12일 · 9회/)).toBeInTheDocument();
  });

  it('만기 임박 계약은 D-day로 강조하고, 처리 대기 요청은 상태로 알린다', async () => {
    renderWithProviders(<BizFleetPage />, { user: MOCK_USERS.corpAdmin, pathname: '/biz/fleet' });

    // 임박(D-12)은 강조, 여유(D-241)는 기본 색
    const soon = await screen.findByText('D-12');
    expect(soon.className).toContain('text-red-500');
    expect(screen.getByText('D-241').className).not.toContain('text-red-500');

    expect(screen.getByText('만기 임박 1건')).toBeInTheDocument();
    expect(screen.getByText('처리 대기 1건')).toBeInTheDocument();
    expect(screen.getByText('연장 요청 중')).toBeInTheDocument();
  });

  it('차량 카드는 상세로 이어진다', async () => {
    renderWithProviders(<BizFleetPage />, { user: MOCK_USERS.corpAdmin, pathname: '/biz/fleet' });
    const card = await screen.findByRole('link', { name: new RegExp(ioniq.modelName) });
    expect(card).toHaveAttribute('href', `/biz/fleet/${ioniq.id}`);
  });

  it('manageFleet 권한이 없으면 목록 대신 안내를 보여준다', () => {
    for (const user of [MOCK_USERS.corpViewer, MOCK_USERS.corpMember, MOCK_USERS.corpApprover]) {
      const { unmount } = renderWithProviders(<BizFleetPage />, { user, pathname: '/biz/fleet' });
      expect(screen.getByText('접근 권한이 없어요')).toBeInTheDocument();
      expect(screen.getByText(/필요 등급: 관리자/)).toBeInTheDocument();
      expect(screen.queryByText(ioniq.modelName)).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('/biz/fleet/:id — 차량 상세', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('계약 정보·운행일지·이용 임직원 통계·계약 이력을 보여준다', async () => {
    renderDetail();

    expect(await screen.findByText(fleetVehicleDetail.modelName)).toBeInTheDocument();
    expect(screen.getByText('690,000원')).toBeInTheDocument(); // 월 리스료
    expect(screen.getByText('D-12')).toBeInTheDocument();

    // 운행일지 — 목적·주행거리·지연
    expect(screen.getByText(/판교 거래처 미팅/)).toBeInTheDocument();
    expect(screen.getByText(/지연 10분/)).toBeInTheDocument();
    // 이용 임직원 통계
    expect(screen.getByText(/6회 · 18시간 · 300.4km/)).toBeInTheDocument();
    // 계약 이력에 종료된 과거 계약도 남는다
    expect(screen.getByText(/650,000원 · 종료/)).toBeInTheDocument();
  });

  it('연장 요청은 희망 만기를 ISO로 보낸다', async () => {
    let sent: { id: string; body: Record<string, string> } | undefined;
    server.use(
      http.post(`${API}/biz/leases/:id/extend-request`, async ({ params, request }) => {
        sent = { id: String(params.id), body: (await request.json()) as Record<string, string> };
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );

    const { userEvent } = renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: '연장 요청' }));

    // 기본 희망 만기 = 현재 만기 +1년
    const dateInput = screen.getByLabelText('희망 만기');
    expect(dateInput).toHaveValue('2031-01-14');
    await userEvent.type(screen.getByPlaceholderText('메모 (선택)'), '1년 더 씁니다');
    await userEvent.click(screen.getByRole('button', { name: '연장 요청 보내기' }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.id).toBe(lease.id);
    expect(sent!.body.note).toBe('1년 더 씁니다');
    expect(new Date(sent!.body.requestedEndAt).toISOString()).toBe('2031-01-13T15:00:00.000Z');
  });

  it('해지 요청은 확인을 거쳐 terminate-request 로 간다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calledId: string | undefined;
    server.use(
      http.post(`${API}/biz/leases/:id/terminate-request`, ({ params }) => {
        calledId = String(params.id);
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );

    const { userEvent } = renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: '해지 요청' }));

    await waitFor(() => expect(calledId).toBe(lease.id));
  });

  it('확인을 취소하면 해지 요청을 보내지 않는다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { userEvent } = renderDetail();
    // 핸들러를 등록하지 않았으므로 호출되면 MSW가 실패시킨다
    await userEvent.click(await screen.findByRole('button', { name: '해지 요청' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('처리 대기 중인 계약은 요청 버튼이 잠기고 대기 상태를 보여준다', async () => {
    server.use(
      http.get(`${API}/biz/fleet/:id`, () =>
        HttpResponse.json({
          ...fleetVehicleDetail,
          lease: {
            ...lease,
            status: 'EXTENSION_REQUESTED',
            requestedEndAt: '2031-01-14T00:00:00.000Z',
            requestedAt: '2030-01-02T00:00:00.000Z',
            requestNote: '1년 더',
            requestedBy: { id: MOCK_USERS.corpAdmin.id, name: MOCK_USERS.corpAdmin.name },
          },
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByText(/운영 담당자 처리를 기다리고 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '연장 요청' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '해지 요청' })).toBeDisabled();
  });

  it('서버가 거절하면 사유를 그대로 보여준다', async () => {
    server.use(
      http.post(`${API}/biz/leases/:id/terminate-request`, () =>
        HttpResponse.json({ message: '이미 처리 대기 중인 요청이 있습니다' }, { status: 409 }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { userEvent } = renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: '해지 요청' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 처리 대기 중인 요청이 있습니다');
  });

  it('manageFleet 권한이 없으면 상세도 막힌다', async () => {
    renderDetail(MOCK_USERS.corpApprover);
    expect(await screen.findByText('접근 권한이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연장 요청' })).not.toBeInTheDocument();
  });
});
