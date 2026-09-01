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
import { MOCK_USERS, renderWithProviders, routeParams, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const url = (path: string) => `${API}${path}`;

function renderDetail(id = reservationInUse.id) {
  return renderWithProviders(<ReservationDetailPage params={routeParams({ id })} />, {
    user: MOCK_USERS.personal,
    pathname: `/reservations/${id}`,
  });
}

const step = (n: number) => screen.getByTestId(`step-${n}`);

describe('예약 상세 — 이용 단계형 흐름', () => {
  it('이용 시작 직후에는 체크인 단계만 열리고 이후 단계는 잠겨 있다', async () => {
    renderDetail();

    expect(await screen.findByRole('button', { name: '체크인 완료' })).toBeInTheDocument();
    expect(step(1)).toHaveAttribute('data-state', 'current');
    for (const n of [2, 4, 5]) {
      expect(step(n)).toHaveAttribute('data-state', 'todo');
    }
    // 잠긴 단계의 본문(반납·체크아웃 버튼)은 아직 없다
    expect(screen.queryByRole('button', { name: '반납하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '체크아웃 완료' })).not.toBeInTheDocument();
  });

  it('체크인을 제출하면 계약대로 사진·메모를 보내고 다음 단계가 열린다', async () => {
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

    // 1단계는 완료로 접히고 스마트키(2)·체크아웃(4) 단계가 열린다
    await waitFor(() => expect(step(1)).toHaveAttribute('data-state', 'done'));
    expect(step(2)).toHaveAttribute('data-state', 'current');
    // 2단계가 열리면서 스마트키 패널이 실제로 붙고, 이용 중 단계에 사고 접수가 열린다
    expect(screen.getByTestId('door-state')).toHaveTextContent('잠김');
    expect(screen.getByRole('button', { name: '사고 접수' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '체크아웃 완료' })).toBeInTheDocument();
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

  it('체크아웃까지 마치면 반납이 열리고, 접힌 단계를 펼쳐 제출한 사진을 다시 볼 수 있다', async () => {
    server.use(
      http.get(url('/rentals/:id/usage'), () => HttpResponse.json(rentalUsageSchema.parse(usageCheckedOut))),
    );

    const { userEvent } = renderDetail();

    expect(await screen.findByRole('button', { name: '반납하기' })).toBeInTheDocument();
    expect(step(1)).toHaveAttribute('data-state', 'done');
    expect(step(4)).toHaveAttribute('data-state', 'done');
    expect(step(5)).toHaveAttribute('data-state', 'current');
    // 체크아웃 요약에는 주차 위치가 남는다
    expect(screen.getByText('지하 2층 B-14')).toBeInTheDocument();

    // 접힌 체크인 단계를 다시 펼치면 제출한 사진이 보인다
    expect(screen.queryByAltText('체크인 사진 1')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /체크인 — 차량 상태 촬영/ }));
    expect(await screen.findByAltText('체크인 사진 1')).toBeInTheDocument();
  });
});

/**
 * M1-5(반납존 변경)와 M1-6(매뉴얼)은 병렬 트랙에서 만들어져 이 페이지에 나중에 연결됐다.
 * 두 연결이 다시 끊어지지 않도록 여기서 고정한다.
 */
describe('예약 상세 — 병렬 트랙 연결 지점', () => {
  it('스마트키 단계에 그 차종의 매뉴얼 링크가 있다', async () => {
    server.use(http.get(url(`/rentals/${reservationInUse.rental!.id}/usage`), () =>
      HttpResponse.json(rentalUsageSchema.parse(usageCheckedIn)),
    ));
    renderDetail();

    const link = await screen.findByRole('link', { name: /매뉴얼/ });
    expect(link).toHaveAttribute('href', `/vehicles/${reservationInUse.vehicleId}/manual`);
  });

  it('이용 전 예약은 "예약 변경"으로 반납 존까지 바꿀 수 있는 패널을 연다', async () => {
    const { userEvent } = renderDetail(reservationConfirmed.id);

    await userEvent.click(await screen.findByRole('button', { name: '예약 변경' }));

    // 시간만 있던 예전 인라인 폼이 아니라 반납 장소 선택이 함께 있는 패널이어야 한다
    expect(await screen.findByLabelText('반납 장소')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이 내용으로 변경' })).toBeInTheDocument();
  });
});
