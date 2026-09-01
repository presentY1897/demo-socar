import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { OPS_TAB_LABEL, opsTabSchema } from '@socar/shared';
import DashboardPage from '@/app/dashboard/page';
import { server } from '@/test/msw/server';
import {
  liveTick,
  opsAlerts,
  opsFleetDetail,
  opsFleetMaintenance,
  opsOverview,
} from '@/test/msw/fixtures';
import { lastEventSource, stubEventSource } from '@/test/sse';
import {
  MOCK_USERS,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@/test/utils';

// 지도는 leaflet(캔버스/DOM 측정)에 의존해 jsdom에서 의미가 없다 —
// 운영 홈의 관심사는 "SSE 틱이 마커 좌표로 이어지는가"이므로 마커만 텍스트로 뱉는다.
vi.mock('@/components/ZoneMap', () => ({
  default: ({
    vehicles,
  }: {
    vehicles?: { id: string; label: string; lat: number; lng: number }[];
  }) => (
    <div data-testid="ops-map">
      {(vehicles ?? []).map((v) => (
        <span key={v.id} data-testid={`marker-${v.id}`}>
          {v.label} @ {v.lat.toFixed(3)},{v.lng.toFixed(3)}
        </span>
      ))}
    </div>
  ),
}));

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const renderOps = (searchParams = '') => {
  stubEventSource();
  return renderWithProviders(<DashboardPage />, {
    user: MOCK_USERS.opsAdmin,
    pathname: '/dashboard',
    searchParams,
  });
};

/** 스탯 카드는 라벨과 값이 한 카드 안에 있다 — 같은 숫자를 쓰는 다른 카드와 헷갈리지 않게 */
const statCard = (label: string) => screen.getByText(label).parentElement as HTMLElement;

describe('운영 센터 — 탭 셸', () => {
  it('shared 탭 키를 순서·라벨 그대로 렌더하고 운영 홈으로 시작한다', async () => {
    renderOps();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(
      opsTabSchema.options.map((t) => OPS_TAB_LABEL[t]),
    );
    expect(screen.getByRole('tab', { name: OPS_TAB_LABEL.home })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('지금 운행 중')).toBeInTheDocument();
  });

  it('탭을 누르면 그 탭의 내용으로 바뀐다', async () => {
    const { userEvent } = renderOps();

    await userEvent.click(screen.getByRole('tab', { name: OPS_TAB_LABEL.fleet }));

    expect(screen.getByRole('tab', { name: OPS_TAB_LABEL.fleet })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('button', { name: '차량 등록' })).toBeInTheDocument();
    expect(screen.queryByText('지금 운행 중')).not.toBeInTheDocument();
  });

  it('?tab= 딥링크로 특정 탭을 열 수 있다', () => {
    renderOps('tab=fleet');

    expect(screen.getByRole('tab', { name: OPS_TAB_LABEL.fleet })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('운영 어드민이 아니면 어떤 탭도 열리지 않는다', async () => {
    renderWithProviders(<DashboardPage />, { user: MOCK_USERS.personal, pathname: '/dashboard' });

    expect(await screen.findByText('운영 어드민 계정으로 로그인하세요')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});

describe('운영 센터 — ① 운영 홈', () => {
  it('상단 스탯과 경고 피드를 MSW 값 그대로 렌더한다', async () => {
    renderOps();

    await screen.findByText('지금 운행 중');
    expect(within(statCard('지금 운행 중')).getByText(`${opsOverview.inUseCount}대`)).toBeInTheDocument();
    expect(
      within(statCard('탁송 진행 중')).getByText(`${opsOverview.inTransitCount}대`),
    ).toBeInTheDocument();
    expect(
      within(statCard('오늘 예약')).getByText(`${opsOverview.todayReservationCount}건`),
    ).toBeInTheDocument();
    expect(
      within(statCard('미배정 작업')).getByText(`${opsOverview.unassignedTaskCount}건`),
    ).toBeInTheDocument();

    for (const a of opsAlerts) {
      expect(await screen.findByText(a.title)).toBeInTheDocument();
    }
    // 매출·손익은 회계 탭 소관 — 운영 홈에는 없다 (M3-6 완료 기준)
    expect(screen.queryByText('매출')).not.toBeInTheDocument();
  });

  it('연료 부족 경고를 누르면 차량 탭의 그 차량 상세가 열린다', async () => {
    const fuelAlert = opsAlerts.find((a) => a.kind === 'LOW_FUEL')!;
    const { userEvent } = renderOps();

    await userEvent.click(await screen.findByText(fuelAlert.title));

    expect(screen.getByRole('tab', { name: OPS_TAB_LABEL[fuelAlert.tab] })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const detail = await screen.findByRole('region', { name: '차량 상세' });
    expect(within(detail).getByText(opsFleetDetail.plateNo)).toBeInTheDocument();
  });

  it('계약 만료 경고는 존/계약 탭으로 데려간다', async () => {
    const contractAlert = opsAlerts.find((a) => a.kind === 'CONTRACT_EXPIRING')!;
    const { userEvent } = renderOps();

    await userEvent.click(await screen.findByText(contractAlert.title));

    expect(screen.getByRole('tab', { name: OPS_TAB_LABEL[contractAlert.tab] })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('SSE 틱이 올 때마다 지도 마커 좌표가 갱신된다', async () => {
    renderOps();

    await waitFor(() => expect(screen.getByTestId('ops-map')).toBeInTheDocument());
    const es = lastEventSource();
    expect(es.url).toContain('/metrics/vehicles/live?token=');

    es.emit(liveTick({ lat: 37.503, lng: 127.031 }));
    expect(await screen.findByTestId('marker-veh-ioniq')).toHaveTextContent('37.503,127.031');

    // 다음 틱 — 같은 차가 움직인다
    es.emit(liveTick({ lat: 37.51, lng: 127.04 }));
    await waitFor(() =>
      expect(screen.getByTestId('marker-veh-ioniq')).toHaveTextContent('37.510,127.040'),
    );
  });
});

describe('운영 센터 — ② 차량(Fleet)', () => {
  it('전 차량 표를 상태 배지·존·연료·보험 D-day와 함께 렌더한다', async () => {
    renderOps('tab=fleet');

    expect(await screen.findByText('아반떼')).toBeInTheDocument();
    expect(screen.getByText('아이오닉 5')).toBeInTheDocument();
    expect(screen.getByText('레이')).toBeInTheDocument();
    expect(screen.getByText('D-18')).toBeInTheDocument(); // 보험 만기 임박 차량
    expect(screen.getByText('12%')).toBeInTheDocument(); // 배터리 부족 차량
  });

  it('상태 필터가 서버 쿼리로 나가고 표가 좁혀진다', async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API}/ops/fleet`, ({ request }) => {
        const state = new URL(request.url).searchParams.get('state');
        seen.push(state ?? 'all');
        return HttpResponse.json(state === 'MAINTENANCE' ? [opsFleetMaintenance] : []);
      }),
    );
    const { userEvent } = renderOps('tab=fleet');

    await userEvent.click(screen.getByRole('button', { name: '정비' }));

    expect(await screen.findByText('레이')).toBeInTheDocument();
    expect(screen.queryByText('아반떼')).not.toBeInTheDocument();
    expect(seen).toContain('MAINTENANCE');
  });

  it('행을 누르면 상세 패널이 센서·조작 이력·도입/보험·메모를 보여준다', async () => {
    const { userEvent } = renderOps('tab=fleet');

    await userEvent.click(await screen.findByText('아이오닉 5'));

    const detail = await screen.findByRole('region', { name: '차량 상세' });
    expect(within(detail).getByText('41,022.8 km')).toBeInTheDocument();
    expect(within(detail).getByText('잠김')).toBeInTheDocument(); // 스마트키 상태
    expect(within(detail).getByText(/시동 켜기/)).toBeInTheDocument(); // 조작 이력
    expect(within(detail).getByText('리스 · 월 450,000원')).toBeInTheDocument();
    expect(within(detail).getByText(/앞 타이어 편마모/)).toBeInTheDocument();
  });

  it('정비 메모를 저장하면 body만 담아 보낸다', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/ops/fleet/:id/notes`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: 'note-new',
            vehicleId: opsFleetDetail.id,
            body: '엔진오일 교환 예정',
            authorName: '최운영',
            createdAt: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
    );
    const { userEvent } = renderOps('tab=fleet');
    await userEvent.click(await screen.findByText('아이오닉 5'));

    await userEvent.type(await screen.findByLabelText('정비 메모'), '엔진오일 교환 예정');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(body).toEqual({ body: '엔진오일 교환 예정' }));
  });

  it('너무 짧은 정비 메모는 요청 없이 그 자리에서 막는다', async () => {
    const { userEvent } = renderOps('tab=fleet');
    await userEvent.click(await screen.findByText('아이오닉 5'));

    await userEvent.type(await screen.findByLabelText('정비 메모'), 'x');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('2자 이상');
  });
});

describe('운영 센터 — 차량 등록 폼', () => {
  /** 폼을 열고 셀렉트(존·요금제)가 채워질 때까지 기다린다 */
  async function openForm() {
    const rendered = renderOps('tab=fleet');
    await rendered.userEvent.click(await screen.findByRole('button', { name: '차량 등록' }));
    const form = screen.getByRole('form', { name: '신규 차량 등록' });
    await within(form).findByRole('option', { name: /강남역 공영주차장/ });
    await within(form).findByRole('option', { name: /준중형 EV/ });
    return { ...rendered, form };
  }

  const fill = async (
    form: HTMLElement,
    userEvent: ReturnType<typeof renderOps>['userEvent'],
  ) => {
    await userEvent.type(within(form).getByLabelText('차종'), 'EV6');
    await userEvent.type(within(form).getByLabelText('차량 번호'), '99허 0001');
    await userEvent.selectOptions(within(form).getByLabelText('배정 존'), 'zone-gangnam');
    await userEvent.selectOptions(within(form).getByLabelText('요금제'), 'plan-ev');
    await userEvent.type(within(form).getByLabelText('보험사'), '모카손해보험');
    await userEvent.type(within(form).getByLabelText('보험료(원)'), '52000');
    fireEvent.change(within(form).getByLabelText('보험 만기'), {
      target: { value: '2027-01-31' },
    });
  };

  it('필수값이 비면 요청을 보내지 않고 오류를 보여준다', async () => {
    let called = false;
    server.use(
      http.post(`${API}/ops/vehicles`, () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const { userEvent, form } = await openForm();

    await userEvent.click(within(form).getByRole('button'));

    expect(await screen.findByRole('alert')).toHaveTextContent('입력값을 확인해 주세요');
    expect(called).toBe(false);
  });

  it('구매 차량인데 취득가가 없으면 조합 오류를 그 칸에 띄운다', async () => {
    const { userEvent, form } = await openForm();
    await fill(form, userEvent);

    await userEvent.click(within(form).getByRole('button'));

    expect(await screen.findByText('구매 차량은 취득가를 입력해 주세요')).toBeInTheDocument();
  });

  it('올바른 페이로드로 등록하면 표를 다시 읽고 새 차의 상세를 연다', async () => {
    let body: Record<string, unknown> | undefined;
    const created = { ...opsFleetDetail, id: 'veh-new', modelName: 'EV6', plateNo: '99허 0001' };
    server.use(
      http.post(`${API}/ops/vehicles`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(created, { status: 201 });
      }),
      http.get(`${API}/ops/fleet/veh-new`, () => HttpResponse.json(created)),
    );
    const { userEvent, form } = await openForm();
    await fill(form, userEvent);
    await userEvent.selectOptions(within(form).getByLabelText('연료'), 'EV');
    await userEvent.selectOptions(within(form).getByLabelText('도입 방식'), 'LEASE');
    await userEvent.type(within(form).getByLabelText('월 리스료(원)'), '450000');

    await userEvent.click(within(form).getByRole('button'));

    await waitFor(() =>
      expect(body).toMatchObject({
        modelName: 'EV6',
        plateNo: '99허 0001',
        fuel: 'EV',
        seats: 5,
        zoneId: 'zone-gangnam',
        planId: 'plan-ev',
        acquisitionType: 'LEASE',
        monthlyLeaseKrw: 450000,
        insurerName: '모카손해보험',
        insurancePremiumKrw: 52000,
        insuranceExpiresAt: '2027-01-31T00:00:00+09:00',
      }),
    );
    // 리스 차량이라 취득가는 아예 실리지 않는다
    expect(body).not.toHaveProperty('acquisitionCostKrw');
    expect(await screen.findByRole('region', { name: '차량 상세' })).toBeInTheDocument();
  });
});
