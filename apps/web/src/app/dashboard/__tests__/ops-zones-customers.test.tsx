import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { OPS_TAB_LABEL } from '@socar/shared';
import DashboardPage from '@/app/dashboard/page';
import { server } from '@/test/msw/server';
import {
  opsAlerts,
  opsInquiries,
  opsInquiryDone,
  opsInquiryPending,
  opsUserDetail,
  opsUserRisky,
  opsZoneFull,
  opsZonePaid,
} from '@/test/msw/fixtures';
import { stubEventSource } from '@/test/sse';
import {
  MOCK_USERS,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@/test/utils';

vi.mock('@/components/ZoneMap', () => ({ default: () => <div data-testid="ops-map" /> }));

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const renderOps = (searchParams = '') => {
  stubEventSource();
  return renderWithProviders(<DashboardPage />, {
    user: MOCK_USERS.opsAdmin,
    pathname: '/dashboard',
    searchParams,
  });
};

describe('운영 센터 — ④ 존/계약', () => {
  it('유·무료 배지 · 파트너 · 월 비용 · 만료 임박 · 잔여 자리를 보여준다', async () => {
    renderOps('tab=zones');

    expect(await screen.findByText(opsZonePaid.name)).toBeInTheDocument();
    expect(screen.getByText('유료')).toBeInTheDocument();
    expect(screen.getByText('무료')).toBeInTheDocument();
    expect(screen.getByText('하이파킹')).toBeInTheDocument();
    expect(screen.getByText('월 250,000원')).toBeInTheDocument();
    expect(screen.getByText('계약 D-12')).toBeInTheDocument(); // 만료 임박 강조
    expect(screen.getByText(`잔여 ${opsZonePaid.freeSlots}`)).toBeInTheDocument();
  });

  it('잔여 자리가 0인 존은 경고로 표시한다', async () => {
    renderOps('tab=zones');

    await screen.findByText(opsZoneFull.name);
    expect(screen.getByText('잔여 0')).toBeInTheDocument();
    expect(screen.getByText('자리 없음')).toBeInTheDocument();
  });

  it('초과 배정(잔여 음수)은 0으로 깎지 않고 그대로 보여준다', async () => {
    server.use(
      http.get(`${API}/ops/zones`, () =>
        HttpResponse.json([{ ...opsZoneFull, assignedCount: 8, freeSlots: -2 }]),
      ),
    );
    renderOps('tab=zones');

    expect(await screen.findByText('잔여 -2')).toBeInTheDocument();
    expect(screen.getByText('초과 배정')).toBeInTheDocument();
  });

  it('행을 펼쳐 계약을 수정하면 PATCH 페이로드가 그대로 나가고 목록에 반영된다', async () => {
    let body: Record<string, unknown> | undefined;
    // 저장 후 목록을 다시 읽는 흐름이라 목이 상태를 들고 있어야 한다
    let saved = false;
    const updated = {
      ...opsZonePaid,
      contract: { ...opsZonePaid.contract, partnerName: '모두의주차장', monthlyFeeKrw: 300000 },
    };
    server.use(
      http.get(`${API}/ops/zones`, () =>
        HttpResponse.json([saved ? updated : opsZonePaid, opsZoneFull]),
      ),
      http.patch(`${API}/ops/zones/:id/contract`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        saved = true;
        return HttpResponse.json(updated);
      }),
    );
    const { userEvent } = renderOps('tab=zones');

    await userEvent.click(await screen.findByText(opsZonePaid.name));
    const form = await screen.findByRole('form', { name: `${opsZonePaid.name} 계약 수정` });

    const partner = within(form).getByLabelText('계약 파트너');
    await userEvent.clear(partner);
    await userEvent.type(partner, '모두의주차장');
    const fee = within(form).getByLabelText('월 비용(원)');
    await userEvent.clear(fee);
    await userEvent.type(fee, '300000');
    await userEvent.click(within(form).getByRole('button', { name: '계약 저장' }));

    await waitFor(() =>
      expect(body).toMatchObject({
        isPaid: true,
        partnerName: '모두의주차장',
        monthlyFeeKrw: 300000,
      }),
    );
    expect(await screen.findByText('모두의주차장')).toBeInTheDocument();
    expect(screen.getByText('월 300,000원')).toBeInTheDocument();
  });

  it('유료로 두고 월 비용을 0으로 만들면 요청 없이 막는다', async () => {
    let called = false;
    server.use(
      http.patch(`${API}/ops/zones/:id/contract`, () => {
        called = true;
        return HttpResponse.json(opsZonePaid);
      }),
    );
    const { userEvent } = renderOps('tab=zones');

    await userEvent.click(await screen.findByText(opsZonePaid.name));
    const form = await screen.findByRole('form', { name: `${opsZonePaid.name} 계약 수정` });
    const fee = within(form).getByLabelText('월 비용(원)');
    await userEvent.clear(fee);
    await userEvent.type(fee, '0');
    await userEvent.click(within(form).getByRole('button', { name: '계약 저장' }));

    expect(
      await screen.findByText('유료 계약은 월 비용이 0보다 커야 하고, 무료 존은 0이어야 합니다'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('입력값을 확인해 주세요');
    expect(called).toBe(false);
  });

  it('계약 종료일이 시작일보다 앞서면 그 칸에 오류를 띄운다', async () => {
    const { userEvent } = renderOps('tab=zones');

    await userEvent.click(await screen.findByText(opsZonePaid.name));
    const form = await screen.findByRole('form', { name: `${opsZonePaid.name} 계약 수정` });
    fireEvent.change(within(form).getByLabelText('계약 시작'), { target: { value: '2027-06-01' } });
    fireEvent.change(within(form).getByLabelText('계약 종료'), { target: { value: '2027-01-01' } });
    await userEvent.click(within(form).getByRole('button', { name: '계약 저장' }));

    expect(await screen.findByText('계약 종료일은 시작일 이후여야 합니다')).toBeInTheDocument();
  });

  it('계약 만료 경고를 누르면 존/계약 탭에서 그 존이 펼쳐진다', async () => {
    const alert = opsAlerts.find((a) => a.kind === 'CONTRACT_EXPIRING')!;
    const { userEvent } = renderOps();

    await userEvent.click(await screen.findByText(alert.title));

    expect(screen.getByRole('tab', { name: OPS_TAB_LABEL.zones })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      await screen.findByRole('form', { name: `${opsZonePaid.name} 계약 수정` }),
    ).toBeInTheDocument();
  });
});

describe('운영 센터 — ⑤ 고객', () => {
  it('유의 유저를 횟수 배지와 함께 보여준다 (점수는 보여주지 않는다)', async () => {
    renderOps('tab=customers');

    expect(await screen.findByText(opsUserRisky.name)).toBeInTheDocument();
    expect(screen.getByText(`지연 반납 ${opsUserRisky.lateReturnCount}`)).toBeInTheDocument();
    expect(screen.getByText(`사고 접수 ${opsUserRisky.incidentCount}`)).toBeInTheDocument();
    expect(screen.getByText(`결제 거절 ${opsUserRisky.paymentFailCount}`)).toBeInTheDocument();
    expect(screen.queryByText(String(opsUserRisky.riskScore))).not.toBeInTheDocument();
  });

  it('유저를 누르면 최근 예약과 사고 이력이 열린다', async () => {
    const { userEvent } = renderOps('tab=customers');

    await userEvent.click(await screen.findByText(opsUserRisky.name));

    const history = await screen.findByLabelText('유저 이력');
    expect(within(history).getByText(/아반떼/)).toBeInTheDocument();
    expect(within(history).getByText(/45분 지연/)).toBeInTheDocument();
    expect(
      within(history).getByText(opsUserDetail.recentIncidents[0].description),
    ).toBeInTheDocument();
  });

  it('지연 반납 경고를 누르면 고객 탭에서 그 유저 이력이 열린다', async () => {
    const alert = opsAlerts.find((a) => a.kind === 'LATE_RETURN')!;
    const { userEvent } = renderOps();

    await userEvent.click(await screen.findByText(alert.title));

    expect(screen.getByRole('tab', { name: OPS_TAB_LABEL.customers })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByLabelText('유저 이력')).toBeInTheDocument();
  });

  it('문의함은 답변 대기만 먼저 보여주고, 전체로 넓히면 답변 완료도 나온다', async () => {
    const { userEvent } = renderOps('tab=customers');

    expect(await screen.findByText(opsInquiryPending.body)).toBeInTheDocument();
    expect(screen.queryByText(opsInquiryDone.body)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '전체' }));

    expect(await screen.findByText(opsInquiryDone.body)).toBeInTheDocument();
    expect(screen.getByText(opsInquiryDone.answer!)).toBeInTheDocument();
  });

  it('답변을 등록하면 answer만 담아 보내고 목록이 ANSWERED로 바뀐다', async () => {
    let body: unknown;
    let answered = false;
    server.use(
      http.get(`${API}/ops/inquiries`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        const rows = answered
          ? opsInquiries.map((i) =>
              i.id === opsInquiryPending.id
                ? { ...i, status: 'ANSWERED', answer: '펌웨어를 업데이트했어요', answeredAt: new Date().toISOString(), answeredBy: { id: 'user-ops', name: '최운영' } }
                : i,
            )
          : opsInquiries;
        return HttpResponse.json(status ? rows.filter((i) => i.status === status) : rows);
      }),
      http.post(`${API}/ops/inquiries/:id/answer`, async ({ request }) => {
        body = await request.json();
        answered = true;
        return HttpResponse.json({ ...opsInquiryPending, status: 'ANSWERED' }, { status: 201 });
      }),
    );
    const { userEvent } = renderOps('tab=customers');

    await screen.findByText(opsInquiryPending.body);
    await userEvent.type(screen.getByLabelText('답변 내용'), '펌웨어를 업데이트했어요');
    await userEvent.click(screen.getByRole('button', { name: '답변 등록' }));

    await waitFor(() => expect(body).toEqual({ answer: '펌웨어를 업데이트했어요' }));
    // 답변 대기 필터에서 사라진다
    await waitFor(() =>
      expect(screen.queryByText(opsInquiryPending.body)).not.toBeInTheDocument(),
    );
  });

  it('너무 짧은 답변은 요청 없이 그 자리에서 막는다', async () => {
    let called = false;
    server.use(
      http.post(`${API}/ops/inquiries/:id/answer`, () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const { userEvent } = renderOps('tab=customers');

    await screen.findByText(opsInquiryPending.body);
    await userEvent.type(screen.getByLabelText('답변 내용'), '넵');
    await userEvent.click(screen.getByRole('button', { name: '답변 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('5자 이상');
    expect(called).toBe(false);
  });
});
