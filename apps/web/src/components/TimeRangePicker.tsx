'use client';

import { fromParts, TIMES_10MIN, toDatePart, toTimePart } from '@/lib/timerange';
import { todayKst } from '@/lib/format';

/** 시작~반납 시각 선택 (10분 단위). ISO 문자열로 주고받는다 */
export function TimeRangePicker({
  startAt,
  endAt,
  onChange,
  compact,
}: {
  startAt: string;
  endAt: string;
  onChange: (startAt: string, endAt: string) => void;
  compact?: boolean;
}) {
  const set = (which: 'start' | 'end', date: string, time: string) => {
    const iso = fromParts(date, time);
    if (which === 'start') onChange(iso, endAt);
    else onChange(startAt, iso);
  };

  const row = (label: string, which: 'start' | 'end', iso: string) => (
    <div className="flex items-center gap-1.5">
      <span className={`shrink-0 text-xs text-gray-400 ${compact ? 'w-8' : 'w-10'}`}>{label}</span>
      <input
        type="date"
        value={toDatePart(iso)}
        min={todayKst()}
        onChange={(e) => set(which, e.target.value, toTimePart(iso))}
        className="min-w-0 flex-1 rounded-md border border-gray-300 px-1.5 py-1 text-xs"
      />
      <select
        value={toTimePart(iso)}
        onChange={(e) => set(which, toDatePart(iso), e.target.value)}
        className="rounded-md border border-gray-300 px-1 py-1 text-xs tabular-nums"
      >
        {TIMES_10MIN.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className={compact ? 'flex flex-col gap-1' : 'flex flex-col gap-2'}>
      {row('시작', 'start', startAt)}
      {row('반납', 'end', endAt)}
    </div>
  );
}
