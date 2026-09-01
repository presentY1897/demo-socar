/**
 * 운영 센터 6탭이 공유하는 표시 조각.
 *
 * 탭마다 카드/표/빈 상태를 따로 만들면 같은 화면 안에서 여백과 글자 크기가 갈린다.
 * 여기 있는 것들은 데이터를 모르는 순수 표시 컴포넌트다 — 판정과 라벨은 shared가 한다.
 */

export function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${warn ? 'text-red-500' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-gray-400">{children}</p>;
}

/** 라벨 + 값 한 줄 — 상세 패널의 기본 단위 */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-xs text-gray-400">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

/**
 * 연료/배터리 게이지. 임계 판정은 서버가 내려준 `low`를 그대로 쓴다 —
 * 화면이 다시 20%를 적으면 경고 피드와 표가 어긋난다.
 */
export function FuelGauge({ label, pct, low }: { label: string; pct: number; low: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="min-w-[88px]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">{label}</span>
        <span className={low ? 'font-semibold text-red-500' : 'text-gray-600'}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="mt-0.5 h-1.5 w-full rounded-full bg-gray-100">
        <div
          role="presentation"
          className={`h-1.5 rounded-full ${low ? 'bg-red-400' : 'bg-sky-500'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** 만기까지 남은 일수 — 임박 여부는 서버 판정(expiringSoon)을 따른다 */
export function DDayBadge({ dDay, soon, label }: { dDay: number; soon: boolean; label?: string }) {
  const text = dDay < 0 ? `${label ?? ''} 만료됨`.trim() : `${label ?? ''} D-${dDay}`.trim();
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        soon ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {text}
    </span>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-500">
      {children}
    </p>
  );
}

/** 폼 한 칸 — 라벨 클릭으로 입력에 초점이 가도록 label로 감싼다 */
export function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
      {error && <span className="mt-0.5 block text-[11px] text-red-500">{error}</span>}
    </label>
  );
}

export const inputClass =
  'mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm';
