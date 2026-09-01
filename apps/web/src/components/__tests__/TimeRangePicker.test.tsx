import { describe, expect, it, vi } from 'vitest';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { fireEvent, renderWithProviders, within } from '@/test/utils';
import { TIMES_10MIN } from '@/lib/timerange';

/** 2030-01-02(수) 09:00 KST = 2030-01-02T00:00:00Z */
const START = '2030-01-02T00:00:00.000Z';
const END = '2030-01-02T02:00:00.000Z';

/** [시작, 반납] 순서의 날짜 입력 / 시각 선택 */
const fields = (container: HTMLElement) => ({
  dates: [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')],
  times: [...container.querySelectorAll<HTMLSelectElement>('select')],
});

const setup = (onChange = vi.fn()) => {
  const view = renderWithProviders(
    <TimeRangePicker startAt={START} endAt={END} onChange={onChange} />,
  );
  return { ...view, onChange, ...fields(view.container) };
};

describe('TimeRangePicker', () => {
  it('시각 선택지는 10분 단위 144개다', () => {
    const { times } = setup();

    const options = within(times[0]).getAllByRole('option');
    expect(options).toHaveLength(144);
    expect(options[0]).toHaveTextContent('00:00');
    expect(options[1]).toHaveTextContent('00:10'); // 10분 단위 — 00:05 같은 값은 없다
    expect(options.at(-1)).toHaveTextContent('23:50');
    expect(TIMES_10MIN).toHaveLength(144);
  });

  it('시작/반납의 현재 값이 KST 기준으로 표시된다', () => {
    const { dates, times } = setup();

    expect(times[0]).toHaveValue('09:00');
    expect(times[1]).toHaveValue('11:00');
    expect(dates[0]).toHaveValue('2030-01-02');
  });

  it('시작 시각을 바꾸면 반납은 유지한 채 onChange가 ISO로 호출된다', async () => {
    const { userEvent, onChange, times } = setup();

    await userEvent.selectOptions(times[0], '10:30');

    expect(onChange).toHaveBeenCalledTimes(1);
    const [nextStart, nextEnd] = onChange.mock.calls[0];
    expect(new Date(nextStart).toISOString()).toBe('2030-01-02T01:30:00.000Z'); // 10:30 KST
    expect(nextEnd).toBe(END);
  });

  it('반납 날짜를 바꾸면 시작은 유지한 채 반납만 갱신된다', () => {
    const { onChange, dates } = setup();

    fireEvent.change(dates[1], { target: { value: '2030-01-03' } });

    const [nextStart, nextEnd] = onChange.mock.calls.at(-1)!;
    expect(nextStart).toBe(START);
    expect(new Date(nextEnd).toISOString()).toBe('2030-01-03T02:00:00.000Z'); // 11:00 KST 유지
  });

  it('날짜 입력을 비워도 무효한 시각을 올려보내지 않는다', () => {
    const { onChange, dates } = setup();

    fireEvent.change(dates[0], { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('오늘 이전 날짜는 선택할 수 없다 (min 제약)', () => {
    const { dates } = setup();
    for (const d of dates) expect(d).toHaveAttribute('min');
  });
});
