import dayjs, { type Dayjs } from 'dayjs';

/** 10분 단위 시각 목록 (00:00 ~ 23:50) */
export const TIMES_10MIN = Array.from({ length: 144 }, (_, i) => {
  const h = Math.floor(i / 6);
  const m = (i % 6) * 10;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

export const ceil10 = (d: Dayjs) => {
  const m = d.minute();
  const up = Math.ceil(m / 10) * 10;
  return d.minute(0).second(0).millisecond(0).add(up, 'minute');
};

/**
 * 기본 이용 구간: 지금에서 가장 가까운 다음 10분 슬롯 ~ +2시간.
 *
 * 이용 시작은 예약 시작 10분 전부터 열리므로, 기본값 그대로 예약하면 곧바로 이용을 시작할 수 있다.
 * (여유를 두려고 +30분을 기본으로 잡았더니 "지금 빌려서 바로 타 보기"가 30분 기다려야 되는 일이 됐다)
 */
export function defaultRange(): { startAt: string; endAt: string } {
  const start = ceil10(dayjs());
  return { startAt: start.toISOString(), endAt: start.add(2, 'hour').toISOString() };
}

/** 구간의 시작이 이미 지났는가 — 손대지 않은 기본 구간을 다음 슬롯으로 굴릴지 판단한다 */
export const hasStarted = (range: { startAt: string }, now: Dayjs = dayjs()) =>
  dayjs(range.startAt).isBefore(now);

export const toDatePart = (iso: string) => dayjs(iso).format('YYYY-MM-DD');
export const toTimePart = (iso: string) => dayjs(iso).format('HH:mm');
export const fromParts = (date: string, time: string) =>
  dayjs(`${date}T${time}:00+09:00`).toISOString();

/** 구간 길이 표기: "2시간 30분" */
export function durationLabel(startAt: string, endAt: string): string {
  const mins = dayjs(endAt).diff(dayjs(startAt), 'minute');
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
