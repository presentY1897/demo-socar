import { describe, expect, it } from 'vitest';
import LoginPage from '@/app/login/page';
import { renderWithProviders, screen, waitFor } from '@/test/utils';

/**
 * 데모 계정 목록은 세 곳(로그인 화면 · API 시드 · MSW 목)이 **각자 늘어나는 배열**이다.
 * 한쪽만 늘면 버튼은 보이는데 로그인이 401로 떨어진다 — 실제로 핸들러 계정이 그랬다
 * (M2가 화면·픽스처를 늘리는 동안 M5가 키운 목 계정 배열에는 들어가지 못했다).
 *
 * 그래서 목록을 손으로 적지 않고 **화면에 렌더된 버튼에서 뽑아** 전부 눌러 본다.
 */
describe('로그인 — 데모 계정', () => {
  /** 데모 계정 버튼에 적힌 이메일 (제출 버튼에는 이메일이 없어 걸러진다) */
  const emailsOnScreen = () =>
    screen
      .getAllByRole('button')
      .map((b) => b.textContent?.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0])
      .filter((email): email is string => Boolean(email));

  it('화면에 걸린 데모 계정은 하나도 빠짐없이 실제로 로그인된다', async () => {
    const first = renderWithProviders(<LoginPage />);
    const emails = emailsOnScreen();
    expect(emails).toContain('handler@demo.mocar.kr');
    expect(emails.length).toBeGreaterThanOrEqual(7);
    first.unmount();

    for (const email of emails) {
      const view = renderWithProviders(<LoginPage />);
      await view.userEvent.click(screen.getByRole('button', { name: new RegExp(email) }));
      // 로그인에 성공해야 화면 이동이 일어난다 — 실패하면 에러 문구만 뜨고 멈춘다
      await waitFor(() => expect(view.router.push).toHaveBeenCalled());
      expect(screen.queryByText(/올바르지 않/)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('로그인 직후 첫 화면은 역할이 정한다 — 핸들러는 작업 큐, 법인은 /biz', async () => {
    const landings: [email: string, landing: string][] = [
      ['handler@demo.mocar.kr', '/handler'],
      ['admin@demo.mocar.kr', '/biz'],
      ['user@demo.mocar.kr', '/'],
    ];

    for (const [email, landing] of landings) {
      const view = renderWithProviders(<LoginPage />);
      await view.userEvent.click(screen.getByRole('button', { name: new RegExp(email) }));
      await waitFor(() => expect(view.router.push).toHaveBeenCalledWith(landing));
      view.unmount();
    }
  });
});
