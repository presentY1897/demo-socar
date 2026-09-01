import type { LeaseContract, User } from '@prisma/client';
import {
  isLeaseExpiringSoon,
  leaseDDay,
  LeaseStatus,
  type LeaseContractRes,
  type LeaseStatus as LeaseStatusType,
} from '@socar/shared';

/** 요청자까지 붙여 읽은 계약 (목록/상세가 공통으로 쓰는 조회 형태) */
export type LeaseWithRequester = LeaseContract & { requestedBy?: Pick<User, 'id' | 'name'> | null };

/**
 * 리스 계약 → API 응답.
 *
 * D-day와 임박 여부를 **서버가 계산해서 내려준다** — 화면이 각자 계산하면 임계값이
 * 갈라지기 때문이고, 계산 자체는 shared(`leaseDDay`/`isLeaseExpiringSoon`)가 갖는다.
 */
export function toLeaseRes(lease: LeaseWithRequester, now: Date = new Date()): LeaseContractRes {
  const dDay = leaseDDay(lease.endAt, now);
  return {
    id: lease.id,
    corporationId: lease.corporationId,
    vehicleId: lease.vehicleId,
    monthlyFeeKrw: lease.monthlyFeeKrw,
    startAt: lease.startAt.toISOString(),
    endAt: lease.endAt.toISOString(),
    status: lease.status as LeaseStatusType,
    dDay,
    // 이미 끝난 계약은 만기 강조 대상이 아니다
    expiringSoon: lease.status !== LeaseStatus.ENDED && isLeaseExpiringSoon(dDay),
    endedAt: lease.endedAt?.toISOString() ?? null,
    requestedAt: lease.requestedAt?.toISOString() ?? null,
    requestedEndAt: lease.requestedEndAt?.toISOString() ?? null,
    requestNote: lease.requestNote,
    requestedBy: lease.requestedBy ? { id: lease.requestedBy.id, name: lease.requestedBy.name } : null,
  };
}

/** 차량의 "진행 중" 계약 — 종료되지 않은 것 중 만기가 가장 늦은 1건 */
export function currentLease<T extends LeaseContract>(leases: readonly T[]): T | null {
  const live = leases.filter((l) => l.status !== LeaseStatus.ENDED);
  if (live.length === 0) return null;
  return live.reduce((latest, l) => (l.endAt > latest.endAt ? l : latest));
}
