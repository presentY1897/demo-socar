import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  conditionReportSchema,
  photosSchema,
  rentalUsageSchema,
  type RentalUsageRes,
} from '@socar/shared';
import ReservationDetailPage from '@/app/reservations/[id]/page';
import { server } from '@/test/msw/server';
import {
  conditionCheckIn,
  conditionCheckOut,
  reservationConfirmed,
  reservationInUse,
  usageCheckedIn,
  usageCheckedOut,
  usageEmpty,
} from '@/test/msw/fixtures';
import { jpegFile, stubImagePipeline } from '@/test/image';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const url = (path: string) => `${API}${path}`;

function renderDetail(id = reservationInUse.id) {
  return renderWithProviders(<ReservationDetailPage />, {
    user: MOCK_USERS.personal,
    pathname: `/reservations/${id}`,
    params: { id },
  });
}

const stage = () => screen.getByTestId('stage');
const progress = (key: 'CHECK_IN' | 'DRIVING' | 'RETURN') => screen.getByTestId(`progress-${key}`);

/**
 * 이용이 시작되면 **지금 단계의 화면 하나만** 보인다 (lib/rental-stage.ts).
 * 다섯 카드를 한 페이지에 늘어놓던 구조에서 바뀐 지점을 여기서 고정한다.
 */
describe('예약 상세 — 한 번에 한 단계', () => {
  it('이용 시작 직후에는 체크인 화면만 보인다 — 스마트키·체크아웃·반납은 아직 없다', async () => {
    renderDetail();

    expect(await screen.findByRole('button', { name: '체크인 완료' })).toBeInTheDocument();
    expect(stage()).toHaveAttribute('data-stage', 'CHECK_IN');
    expect(progress('CHECK_IN')).toHaveAttribute('data-state', 'current');
    expect(progress('DRIVING')).toHaveAttribute('data-state', 'todo');
    expect(progress('RETURN')).toHaveAttribute('data-state', 'todo');

    expect(screen.queryByTestId('door-state')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '체크아웃 완료' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '반납하기' })).not.toBeInTheDocument();
  });

  it('체크인을 제출하면 계약대로 사진·메모를 보내고 이용 중 화면으로 넘어간다', async () => {
    stubImagePipeline({ bytesPerStep: [150 * 1024] });
    let usageState: RentalUsageRes = usageEmpty;
    let sent: { notes?: string; photos: unknown[] } | undefined;
    server.use(
      http.get(url('/rentals/:id/usage'), () => HttpResponse.json(rentalUsageSchema.parse(usageState))),
      http.post(url('/rentals/:id/check-in'), async ({ request }) => {
        sent = (await request.json()) as { notes?: string; photos: unknown[] };
        usageState = usageCheckedIn;
        return HttpResponse.json(conditionReportSchema.parse(conditionCheckIn), { status: 201 });
      }),
    );

    const { userEvent } = renderDetail();
    await screen.findByRole('button', { name: '체크인 완료' });

    await userEvent.upload(screen.getByLabelText('차량 상태 촬영'), jpegFile());
    await screen.findByAltText('첨부 사진 1');
    await userEvent.type(screen.getByLabelText('차량 상태 메모 (선택)'), '뒷문 스크래치');
    await userEvent.click(screen.getByRole('button', { name: '체크인 완료' }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.notes).toBe('뒷문 스크래치');
    expect(photosSchema.safeParse(sent!.photos).success).toBe(true);
    expect(sent!.photos).toHaveLength(1);

    // 체크인 폼은 사라지고 스마트키가 주인공인 이용 중 화면이 된다
    await waitFor(() => expect(stage()).toHaveAttribute('data-stage', 'DRIVING'));
    expect(progress('CHECK_IN')).toHaveAttribute('data-state', 'done');
    expect(screen.queryByRole('button', { name: '체크인 완료' })).not.toBeInTheDocument();
    expect(screen.getByTestId('door-state')).toHaveTextContent('잠김');
    expect(screen.getByRole('button', { name: '사고 접수' })).toBeInTheDocument();
    // 체크아웃 폼은 "반납 시작"을 누르기 전에는 보이지 않는다
    expect(screen.queryByRole('button', { name: '체크아웃 완료' })).not.toBeInTheDocument();
  });

  it('제출이 실패하면 폼에 서버 메시지를 그대로 보여준다', async () => {
    stubImagePipeline({ bytesPerStep: [150 * 1024] });
    server.use(
      http.post(url('/rentals/:id/check-in'), () =>
        HttpResponse.json({ message: '이미 체크인을 완료했어요' }, { status: 409 }),
      ),
    );

    const { userEvent } = renderDetail();
    await screen.findByRole('button', { name: '체크인 완료' });

    await userEvent.upload(screen.getByLabelText('차량 상태 촬영'), jpegFile());
    await screen.findByAltText('첨부 사진 1');
    await userEvent.click(screen.getByRole('button', { name: '체크인 완료' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 체크인을 완료했어요');
  });

  it('사진 없이 제출하면 서버에 보내지 않고 shared 검증 메시지를 띄운다', async () => {
    let called = false;
    server.use(
      http.post(url('/rentals/:id/check-in'), () => {
        called = true;
        return HttpResponse.json(conditionReportSchema.parse(conditionCheckIn), { status: 201 });
      }),
    );

    const { userEvent } = renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: '체크인 완료' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('사진을 최소 1장 첨부해 주세요');
    expect(called).toBe(false);
  });

  it('"반납 시작"을 누르면 체크아웃 화면만 남고, 마음이 바뀌면 이용 화면으로 돌아온다', async () => {
    server.use(
      http.get(url('/rentals/:id/usage'), () => HttpResponse.json(rentalUsageSchema.parse(usageCheckedIn))),
    );

    const { userEvent } = renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: /반납 시작/ }));

    expect(stage()).toHaveAttribute('data-stage', 'CHECK_OUT');
    expect(progress('RETURN')).toHaveAttribute('data-state', 'current');
    expect(screen.getByRole('button', { name: '체크아웃 완료' })).toBeInTheDocument();
    expect(screen.queryByTestId('door-state')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /아직 더 탈게요/ }));
    expect(stage()).toHaveAttribute('data-stage', 'DRIVING');
    expect(screen.getByTestId('door-state')).toBeInTheDocument();
  });

  it('체크아웃은 주차 위치가 비면 막고, 채우면 payload에 실어 보낸다', async () => {
    stubImagePipeline({ bytesPerStep: [150 * 1024] });
    let sent: { parkingNote?: string } | undefined;
    server.use(
      http.get(url('/rentals/:id/usage'), () => HttpResponse.json(rentalUsageSchema.parse(usageCheckedIn))),
      http.post(url('/rentals/:id/check-out'), async ({ request }) => {
        sent = (await request.json()) as { parkingNote?: string };
        return HttpResponse.json(conditionReportSchema.parse(conditionCheckOut), { status: 201 });
      }),
    );

    const { userEvent } = renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: /반납 시작/ }));
    const submit = await screen.findByRole('button', { name: '체크아웃 완료' });

    await userEvent.upload(screen.getByLabelText('주차 위치 촬영'), jpegFile());
    await screen.findByAltText('첨부 사진 1');
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('주차 위치(층·구역)를 적어 주세요');
    expect(sent).toBeUndefined();

    await userEvent.type(screen.getByLabelText('주차 위치 (층·구역)'), '지하 2층 B-14');
    await userEvent.click(screen.getByRole('button', { name: '체크아웃 완료' }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.parkingNote).toBe('지하 2층 B-14');
  });

  it('체크아웃까지 마치면 반납 화면이다 — 문을 잠글 키가 남아 있고, 제출한 사진은 기록을 펼쳐 다시 본다', async () => {
    server.use(
      http.get(url('/rentals/:id/usage'), () => HttpResponse.json(rentalUsageSchema.parse(usageCheckedOut))),
    );

    const { userEvent } = renderDetail();

    expect(await screen.findByRole('button', { name: '반납하기' })).toBeInTheDocument();
    expect(stage()).toHaveAttribute('data-stage', 'RETURN');
    expect(progress('DRIVING')).toHaveAttribute('data-state', 'done');
    expect(progress('RETURN')).toHaveAttribute('data-state', 'current');
    // 주차 사진을 찍은 뒤에 문을 잠그므로 반납 화면에도 스마트키가 있다
    expect(screen.getByTestId('door-state')).toBeInTheDocument();
    // 체크아웃 요약에는 주차 위치가 남는다
    expect(screen.getAllByText(/지하 2층 B-14/).length).toBeGreaterThan(0);

    // 접어 둔 체크인 기록을 펼치면 제출한 사진이 보인다
    expect(screen.queryByAltText('체크인 사진 1')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /체크인 기록/ }));
    expect(await screen.findByAltText('체크인 사진 1')).toBeInTheDocument();
  });

  it('이용 중에는 요금·결제 내역을 접어 두고, 펼치면 그대로 보인다', async () => {
    const { userEvent } = renderDetail();
    await screen.findByRole('button', { name: '체크인 완료' });

    expect(screen.queryByText('결제 이력')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /요금 · 결제 내역/ }));
    expect(screen.getByText('결제 이력')).toBeInTheDocument();
  });
});

/**
 * M1-5(반납존 변경)와 M1-6(매뉴얼)은 병렬 트랙에서 만들어져 이 페이지에 나중에 연결됐다.
 * 두 연결이 다시 끊어지지 않도록 여기서 고정한다.
 */
describe('예약 상세 — 병렬 트랙 연결 지점', () => {
  it('매뉴얼 링크는 단계와 무관하게 늘 닿는다 — 이용 전에도, 체크인 전에도', async () => {
    // 예전에는 스마트키 단계 카드 안에 있어서 체크인 전에는 예약 상세에서 매뉴얼로 갈 길이 없었다
    const before = renderDetail(reservationConfirmed.id);
    expect(await screen.findByRole('link', { name: /매뉴얼/ })).toHaveAttribute(
      'href',
      `/vehicles/${reservationConfirmed.vehicleId}/manual`,
    );
    before.unmount();

    renderDetail();
    await screen.findByRole('button', { name: '체크인 완료' });
    expect(screen.getByRole('link', { name: /매뉴얼/ })).toHaveAttribute(
      'href',
      `/vehicles/${reservationInUse.vehicleId}/manual`,
    );
  });

  it('이용 전 예약은 "예약 변경"으로 반납 존까지 바꿀 수 있는 패널을 연다', async () => {
    const { userEvent } = renderDetail(reservationConfirmed.id);

    await userEvent.click(await screen.findByRole('button', { name: '예약 변경' }));

    // 시간만 있던 예전 인라인 폼이 아니라 반납 장소 선택이 함께 있는 패널이어야 한다
    expect(await screen.findByLabelText('반납 장소')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이 내용으로 변경' })).toBeInTheDocument();
  });
});
