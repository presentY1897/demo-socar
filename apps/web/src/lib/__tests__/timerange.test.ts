import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRange, hasStarted } from '../timerange';

const setNow = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

afterEach(() => vi.useRealTimers());

describe('defaultRange — 기본값 그대로 예약해도 바로 이용을 시작할 수 있다', () => {
  it('슬롯 중간이면 다음 10분 슬롯에서 시작해 2시간이다 (18:52 → 19:00~21:00)', () => {
    setNow('2026-09-21T18:52:10+09:00');
    const r = defaultRange();
    expect(r.startAt).toBe(new Date('2026-09-21T19:00:00+09:00').toISOString());
    expect(r.endAt).toBe(new Date('2026-09-21T21:00:00+09:00').toISOString());
  });

  it('슬롯 경계의 분(19:00:20)에는 그 슬롯에서 시작한다 — 서버가 현재 슬롯까지 받는다', () => {
    setNow('2026-09-21T19:00:20+09:00');
    expect(defaultRange().startAt).toBe(new Date('2026-09-21T19:00:00+09:00').toISOString());
  });

  it('어느 시각이든 시작까지 10분을 넘지 않는다 — 이용 시작이 곧바로 열리는 조건', () => {
    for (const minute of [0, 1, 9, 10, 29, 30, 51, 59]) {
      setNow(`2026-09-21T23:${String(minute).padStart(2, '0')}:30+09:00`);
      const untilStartMin = dayjs(defaultRange().startAt).diff(dayjs(), 'second') / 60;
      expect(untilStartMin).toBeLessThanOrEqual(10);
      expect(untilStartMin).toBeGreaterThan(-1);
    }
  });
});

describe('hasStarted — 손대지 않은 기본 구간을 다음 슬롯으로 굴릴지', () => {
  it('시작이 지나면 true, 아직이면 false', () => {
    const range = { startAt: '2026-09-21T10:00:00.000Z' };
    expect(hasStarted(range, dayjs('2026-09-21T09:59:59.000Z'))).toBe(false);
    expect(hasStarted(range, dayjs('2026-09-21T10:00:01.000Z'))).toBe(true);
  });
});
