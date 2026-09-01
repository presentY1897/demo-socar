import type { LeaseContractRes } from '@socar/shared';

/**
 * 리스 만기 D-day 배지.
 *
 * D-day와 임박 여부(`expiringSoon`)는 API가 계산해 내려준 값을 그대로 쓴다 —
 * 화면이 임계값을 다시 적으면 "API는 임박, 화면은 아님"으로 갈리기 때문 (shared 단일 소스).
 */
export function LeaseDDayBadge({ lease }: { lease: LeaseContractRes }) {
  const label = lease.dDay < 0 ? `만기 ${-lease.dDay}일 지남` : `D-${lease.dDay}`;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
        lease.expiringSoon ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {label}
    </span>
  );
}
