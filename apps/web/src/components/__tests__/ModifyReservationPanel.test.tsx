import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { ReservationRes } from '@socar/shared';
import {
  ModifyReservationPanel,
  type ModifiableReservation,
} from '@/components/ModifyReservationPanel';
import { server } from '@/test/msw/server';
import {
  reservationConfirmed,
  reservationDelivery,
  reservationOneway,
} from '@/test/msw/fixtures';
import { renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** 예약 상세 응답 → 패널이 쓰는 최소 형태 */
const toPanelProps = (r: ReservationRes): ModifiableReservation => ({
  id: r.id,
  startAt: r.startAt,
  endAt: r.endAt,
  onewayFeeKrw: r.onewayFeeKrw,
  returnZoneId: r.returnZoneId,
  deliveryLabel: r.deliveryLabel,
  vehicle: { zone: r.vehicle.zone! },
});

const setup = (r: ReservationRes, onDone = vi.fn()) => ({
  ...renderWithProviders(
    <ModifyReservationPanel reservation={toPanelProps(r)} onDone={onDone} />,
    { user: undefined },
  ),
  onDone,
});

const preview = () => screen.getByTestId('oneway-fee-preview').textContent;
const zoneSelect = () => screen.getByLabelText('반납 장소');

describe('ModifyReservationPanel — 예약 변경(시간 + 반납 존)', () => {
  it('같은 지역의 반납 존만 선택지로 보여준다', async () => {
    setup(reservationConfirmed);

    // 왕복(빈 값) + 서울 존 2곳. 부산 존은 편도 대상이 아니다
    await waitFor(() => expect(screen.getAllByRole('option', { name: /편도/ })).toHaveLength(2));
    expect(screen.getByRole('option', { name: /강남역 공영주차장에 반납 \(왕복\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /서면역/ })).not.toBeInTheDocument();
  });

  it('반납 존을 고르면 편도 수수료와 추가 결제 차액이 미리보기로 뜬다', async () => {
    const { userEvent } = setup(reservationConfirmed);

    await waitFor(() => expect(zoneSelect()).toBeInTheDocument());
    expect(preview()).toContain('수수료 차액 없음');

    // 강남 → 역삼 800m: 최소 수수료 5,000원
    await userEvent.selectOptions(zoneSelect(), 'zone-yeoksam');
    expect(preview()).toContain('편도 수수료 5,000원');
    expect(preview()).toContain('추가 결제 5,000원');

    // 강남 → 노원 18km: 거리 기반 9,000원
    await userEvent.selectOptions(zoneSelect(), 'zone-nowon');
    expect(preview()).toContain('편도 수수료 9,000원');
    expect(preview()).toContain('추가 결제 9,000원');
  });

  it('편도 예약을 왕복으로 되돌리면 환급 금액을 보여준다', async () => {
    const { userEvent } = setup(reservationOneway);

    await waitFor(() => expect(zoneSelect()).toHaveValue('zone-yeoksam'));
    expect(preview()).toContain('편도 수수료 5,000원');

    await userEvent.selectOptions(zoneSelect(), '');
    expect(preview()).toContain('크레딧 환급 5,000원');
  });

  it('변경 요청에 새 시각과 반납 존이 실린다', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${API}/reservations/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...reservationConfirmed, returnZoneId: 'zone-nowon' });
      }),
    );

    const { userEvent, onDone } = setup(reservationConfirmed);

    await waitFor(() => expect(zoneSelect()).toBeInTheDocument());
    await userEvent.selectOptions(zoneSelect(), 'zone-nowon');
    await userEvent.click(screen.getByRole('button', { name: '이 내용으로 변경' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body).toMatchObject({
      startAt: reservationConfirmed.startAt,
      endAt: reservationConfirmed.endAt,
      returnZoneId: 'zone-nowon',
    });
    expect(String(body?.idempotencyKey).length).toBeGreaterThanOrEqual(8);
  });

  it('왕복으로 되돌리면 returnZoneId=null 을 명시적으로 보낸다', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${API}/reservations/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(reservationConfirmed);
      }),
    );

    const { userEvent } = setup(reservationOneway);

    await waitFor(() => expect(zoneSelect()).toHaveValue('zone-yeoksam'));
    await userEvent.selectOptions(zoneSelect(), '');
    await userEvent.click(screen.getByRole('button', { name: '이 내용으로 변경' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toHaveProperty('returnZoneId', null);
  });

  it('위치 체인 충돌(409)이면 서버 안내를 그대로 보여준다', async () => {
    server.use(
      http.patch(`${API}/reservations/:id`, () =>
        HttpResponse.json(
          { message: '이 차량의 다음 예약이 시작하는 존이 달라져 변경할 수 없습니다' },
          { status: 409 },
        ),
      ),
    );

    const { userEvent, onDone } = setup(reservationConfirmed);

    await waitFor(() => expect(zoneSelect()).toBeInTheDocument());
    await userEvent.selectOptions(zoneSelect(), 'zone-nowon');
    await userEvent.click(screen.getByRole('button', { name: '이 내용으로 변경' }));

    expect(await screen.findByText(/다음 예약이 시작하는 존/)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('부름 예약에서는 반납 존 선택을 노출하지 않는다', async () => {
    setup(reservationDelivery);

    expect(await screen.findByText(/반납 장소는 바꿀 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByLabelText('반납 장소')).not.toBeInTheDocument();
    expect(screen.queryByTestId('oneway-fee-preview')).not.toBeInTheDocument();
  });
});
