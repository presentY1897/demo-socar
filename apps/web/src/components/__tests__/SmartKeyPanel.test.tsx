import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  vehicleControlResultSchema,
  type SmartKeyStateRes,
  type VehicleControlActionValue,
} from '@socar/shared';
import { SmartKeyPanel } from '@/components/SmartKeyPanel';
import { server } from '@/test/msw/server';
import { smartKeyLocked } from '@/test/msw/fixtures';
import { MOCK_USERS, renderWithProviders, screen, waitFor } from '@/test/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const url = (path: string) => `${API}${path}`;

const unlockedRunning: SmartKeyStateRes = {
  doorLocked: false,
  engineOn: true,
  lastAction: 'IGNITION_ON',
  lastActionAt: '2030-01-02T01:05:00.000Z',
};

const renderPanel = (state = smartKeyLocked) =>
  renderWithProviders(<SmartKeyPanel rentalId="rental-1" state={state} />, {
    user: MOCK_USERS.personal,
  });

describe('스마트키 패널', () => {
  it('문 열기를 누르면 액션을 그대로 보내고 상태 표시가 바뀐다', async () => {
    let sent: { action?: VehicleControlActionValue } | undefined;
    server.use(
      http.post(url('/rentals/:id/control'), async ({ request }) => {
        sent = (await request.json()) as { action: VehicleControlActionValue };
        return HttpResponse.json(
          vehicleControlResultSchema.parse({
            action: 'UNLOCK',
            at: '2030-01-02T01:05:00.000Z',
            state: {
              doorLocked: false,
              engineOn: false,
              lastAction: 'UNLOCK',
              lastActionAt: '2030-01-02T01:05:00.000Z',
            },
          }),
        );
      }),
    );

    const { userEvent } = renderPanel();
    expect(screen.getByTestId('door-state')).toHaveTextContent('잠김');

    await userEvent.click(screen.getByRole('button', { name: /문 열기/ }));

    await waitFor(() => expect(sent).toEqual({ action: 'UNLOCK' }));
    expect(screen.getByTestId('door-state')).toHaveTextContent('열림');
    expect(await screen.findByRole('status')).toHaveTextContent('문을 열었어요');
  });

  it('요청이 실패하면 낙관적 갱신을 되돌리고 사유를 보여준다', async () => {
    server.use(
      http.post(url('/rentals/:id/control'), () =>
        HttpResponse.json({ message: '체크인을 먼저 완료해야 스마트키를 쓸 수 있어요' }, { status: 403 }),
      ),
    );

    const { userEvent } = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /문 열기/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('체크인을 먼저 완료해야');
    // 롤백: 다시 잠김으로 돌아온다
    expect(screen.getByTestId('door-state')).toHaveTextContent('잠김');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('비상등은 시각 피드백만 주고 차량 상태를 바꾸지 않는다', async () => {
    const { userEvent } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /비상등/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('비상등을 켰어요');
    expect(screen.getByTestId('door-state')).toHaveTextContent('잠김');
    expect(screen.getByTestId('engine-state')).toHaveTextContent('시동 OFF');
  });

  it('지금 불가능한 조작은 사유와 함께 눌리지 않는다', async () => {
    // 문이 잠겨 있으면 시동을 걸 수 없다
    renderPanel();
    expect(screen.getByRole('button', { name: /시동 켜기/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /시동 켜기/ })).toHaveAttribute(
      'title',
      '문이 잠겨 있어요. 문을 먼저 열어 주세요',
    );

    // 시동이 걸려 있으면 문을 잠글 수 없다
    renderPanel(unlockedRunning);
    const lock = screen.getAllByRole('button', { name: /문 잠금/ }).at(-1)!;
    expect(lock).toBeDisabled();
    expect(lock).toHaveAttribute('title', expect.stringContaining('시동이 켜져 있어'));
  });
});
