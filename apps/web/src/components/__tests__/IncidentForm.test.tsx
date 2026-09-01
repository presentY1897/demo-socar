import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  incidentResultSchema,
  INSURANCE_META,
  photosSchema,
  type CreateIncidentDto,
} from '@socar/shared';
import { IncidentForm } from '@/components/IncidentForm';
import { server } from '@/test/msw/server';
import { incidentResultFull } from '@/test/msw/fixtures';
import { jpegFile, stubImagePipeline } from '@/test/image';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const url = (path: string) => `${API}${path}`;

const DESCRIPTION = '주차장에서 후진하다 뒤 범퍼가 기둥에 닿았습니다';

const renderForm = () =>
  renderWithProviders(<IncidentForm rentalId="rental-1" />, { user: MOCK_USERS.personal });

/** 접수 폼을 열고 설명을 채운다 */
async function openAndFill(userEvent: ReturnType<typeof renderForm>['userEvent']) {
  await userEvent.click(screen.getByRole('button', { name: '사고 접수' }));
  await userEvent.type(screen.getByLabelText('사고 상황'), DESCRIPTION);
}

describe('사고 접수 (모의)', () => {
  it('접수하면 완료 화면에 가입 면책상품과 자기부담금이 나온다', async () => {
    const { userEvent } = renderForm();
    await openAndFill(userEvent);

    await userEvent.click(screen.getByRole('button', { name: '사고 접수하기' }));

    expect(await screen.findByText('사고가 접수됐어요')).toBeInTheDocument();
    expect(screen.getByText(`가입 면책상품 · ${INSURANCE_META.FULL.label}`)).toBeInTheDocument();
    expect(screen.getByText('0원 (자기부담 없음)')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(incidentResultFull.insurer.phone))).toBeInTheDocument();
    expect(screen.getByText(incidentResultFull.insurer.steps[0])).toBeInTheDocument();
  });

  it('자기부담금이 있는 면책상품은 한도 금액을 보여준다', async () => {
    server.use(
      http.post(url('/rentals/:id/incident'), () =>
        HttpResponse.json(
          incidentResultSchema.parse({
            ...incidentResultFull,
            insurance: {
              tier: 'STANDARD',
              label: INSURANCE_META.STANDARD.label,
              deductibleKrw: INSURANCE_META.STANDARD.deductibleKrw,
              description: INSURANCE_META.STANDARD.description,
            },
          }),
          { status: 201 },
        ),
      ),
    );

    const { userEvent } = renderForm();
    await openAndFill(userEvent);
    await userEvent.click(screen.getByRole('button', { name: '사고 접수하기' }));

    expect(await screen.findByText('최대 300,000원')).toBeInTheDocument();
  });

  it('사진을 붙이면 압축된 사진이 계약대로 함께 전송된다', async () => {
    stubImagePipeline({ bytesPerStep: [150 * 1024] });
    let sent: CreateIncidentDto | undefined;
    server.use(
      http.post(url('/rentals/:id/incident'), async ({ request }) => {
        sent = (await request.json()) as CreateIncidentDto;
        return HttpResponse.json(incidentResultSchema.parse(incidentResultFull), { status: 201 });
      }),
    );

    const { userEvent } = renderForm();
    await openAndFill(userEvent);
    await userEvent.upload(screen.getByLabelText('사고 사진 (선택)'), jpegFile());
    await screen.findByAltText('첨부 사진 1');
    await userEvent.click(screen.getByRole('button', { name: '사고 접수하기' }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.description).toBe(DESCRIPTION);
    expect(photosSchema.safeParse(sent!.photos).success).toBe(true);
    expect(sent!.photos).toHaveLength(1);
  });

  it('설명이 짧으면 보내지 않고 검증 메시지를 띄운다', async () => {
    let called = false;
    server.use(
      http.post(url('/rentals/:id/incident'), () => {
        called = true;
        return HttpResponse.json(incidentResultSchema.parse(incidentResultFull), { status: 201 });
      }),
    );

    const { userEvent } = renderForm();
    await userEvent.click(screen.getByRole('button', { name: '사고 접수' }));
    await userEvent.type(screen.getByLabelText('사고 상황'), '쿵');
    await userEvent.click(screen.getByRole('button', { name: '사고 접수하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('사고 상황을 10자 이상 적어 주세요');
    expect(called).toBe(false);
  });

  it('접수가 실패하면 서버 메시지를 보여준다', async () => {
    server.use(
      http.post(url('/rentals/:id/incident'), () =>
        HttpResponse.json({ message: '본인 대여만 처리할 수 있습니다' }, { status: 403 }),
      ),
    );

    const { userEvent } = renderForm();
    await openAndFill(userEvent);
    await userEvent.click(screen.getByRole('button', { name: '사고 접수하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('본인 대여만 처리할 수 있습니다');
  });
});
