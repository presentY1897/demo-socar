import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { inquirySchema, type CreateInquiryDto, type InquiryRes } from '@socar/shared';
import InquiriesPage from '@/app/inquiries/page';
import { server } from '@/test/msw/server';
import { inquiryAnswered, inquiryOpen } from '@/test/msw/fixtures';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const url = (path: string) => `${API}${path}`;

const renderPage = () =>
  renderWithProviders(<InquiriesPage />, { user: MOCK_USERS.personal, pathname: '/inquiries' });

describe('문의하기', () => {
  it('내 문의를 상태와 답변까지 보여준다', async () => {
    renderPage();

    expect(await screen.findByText(inquiryOpen.body)).toBeInTheDocument();
    expect(screen.getByText('답변 대기')).toBeInTheDocument();
    expect(screen.getByText(inquiryAnswered.body)).toBeInTheDocument();
    expect(screen.getByText('답변 완료')).toBeInTheDocument();
    expect(screen.getByText(inquiryAnswered.answer!)).toBeInTheDocument();
  });

  it('문의를 접수하면 선택한 유형과 본문이 그대로 전송되고 목록이 갱신된다', async () => {
    let sent: CreateInquiryDto | undefined;
    let list: InquiryRes[] = [];
    server.use(
      http.get(url('/me/inquiries'), () => HttpResponse.json(list.map((i) => inquirySchema.parse(i)))),
      http.post(url('/inquiries'), async ({ request }) => {
        sent = (await request.json()) as CreateInquiryDto;
        list = [inquiryOpen];
        return HttpResponse.json(inquirySchema.parse(inquiryOpen), { status: 201 });
      }),
    );

    const { userEvent } = renderPage();
    expect(await screen.findByText('아직 접수한 문의가 없어요')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('문의 유형'), 'RETURN');
    await userEvent.type(screen.getByLabelText('문의 내용'), '반납 정산 금액이 예상과 다릅니다');
    await userEvent.click(screen.getByRole('button', { name: '문의 접수' }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent).toEqual({ category: 'RETURN', body: '반납 정산 금액이 예상과 다릅니다' });
    expect(await screen.findByText(inquiryOpen.body)).toBeInTheDocument();
  });

  it('본문이 너무 짧으면 보내지 않고 검증 메시지를 띄운다', async () => {
    let called = false;
    server.use(
      http.post(url('/inquiries'), () => {
        called = true;
        return HttpResponse.json(inquirySchema.parse(inquiryOpen), { status: 201 });
      }),
    );

    const { userEvent } = renderPage();
    await userEvent.type(await screen.findByLabelText('문의 내용'), '고장');
    await userEvent.click(screen.getByRole('button', { name: '문의 접수' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('문의 내용을 5자 이상 적어 주세요');
    expect(called).toBe(false);
  });

  it('접수가 실패하면 서버 메시지를 보여준다', async () => {
    server.use(
      http.post(url('/inquiries'), () =>
        HttpResponse.json({ message: '본인 이용에 대해서만 문의할 수 있습니다' }, { status: 403 }),
      ),
    );

    const { userEvent } = renderPage();
    await userEvent.type(await screen.findByLabelText('문의 내용'), '반납 정산이 이상합니다');
    await userEvent.click(screen.getByRole('button', { name: '문의 접수' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('본인 이용에 대해서만');
  });
});
