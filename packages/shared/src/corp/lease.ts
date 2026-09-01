import { z } from 'zod';

/**
 * 리스 계약(법인 ↔ MOCAR)의 공유 규칙 — 만기 D-day·이용률 계산과 요청 DTO.
 *
 * 계산을 여기 두는 이유: API가 D-day/이용률을 만들고 웹이 그 값으로 강조 여부를 정한다.
 * 임계값(`LEASE_EXPIRY_WARNING_DAYS`)까지 한 곳에 있어야 "API는 60일, 화면은 30일"처럼
 * 어긋나지 않는다.
 */

export const LeaseStatus = {
  ACTIVE: 'ACTIVE',
  EXTENSION_REQUESTED: 'EXTENSION_REQUESTED',
  TERMINATION_REQUESTED: 'TERMINATION_REQUESTED',
  ENDED: 'ENDED',
} as const;
export type LeaseStatus = (typeof LeaseStatus)[keyof typeof LeaseStatus];

export const leaseStatusSchema = z.enum([
  'ACTIVE',
  'EXTENSION_REQUESTED',
  'TERMINATION_REQUESTED',
  'ENDED',
]);

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  ACTIVE: '계약 중',
  EXTENSION_REQUESTED: '연장 요청 중',
  TERMINATION_REQUESTED: '해지 요청 중',
  ENDED: '종료',
};

/** 운영 어드민 처리를 기다리는 상태 — 이 상태에서는 법인이 새 요청을 낼 수 없다 */
export const LEASE_PENDING_STATUSES: readonly LeaseStatus[] = [
  LeaseStatus.EXTENSION_REQUESTED,
  LeaseStatus.TERMINATION_REQUESTED,
];

export const isLeasePending = (status: LeaseStatus): boolean =>
  LEASE_PENDING_STATUSES.includes(status);

/** 만기 임박으로 강조할 기준 (D-30 이내) */
export const LEASE_EXPIRY_WARNING_DAYS = 30;

/** 이용률 집계 기본 창 — "최근 30일" */
export const FLEET_USAGE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 시각 → KST 달력 날짜의 일련번호 (자정 기준 비교용) */
const kstDayIndex = (value: Date | string): number =>
  Math.floor((new Date(value).getTime() + KST_OFFSET_MS) / DAY_MS);

/**
 * 만기까지 남은 일수 — 시각 차이가 아니라 **KST 달력 날짜** 차이다.
 * (오늘 23:00 만기와 내일 01:00 만기는 "오늘/내일"로 갈려야 사람 감각과 맞는다)
 * 음수면 이미 만기가 지난 것.
 */
export function leaseDDay(endAt: Date | string, now: Date = new Date()): number {
  return kstDayIndex(endAt) - kstDayIndex(now);
}

/** 만기 임박 여부 — 이미 지난 계약(음수)도 임박으로 본다 */
export const isLeaseExpiringSoon = (dDay: number): boolean => dDay <= LEASE_EXPIRY_WARNING_DAYS;

/** 이용률 계산 입력 — 운행 1건 */
export interface UsageTrip {
  startAt: Date | string;
  endAt: Date | string;
  distanceKm?: number | null;
}

export interface FleetUsage {
  windowDays: number;
  tripCount: number;
  /** 운행이 걸쳐 있던 KST 날짜 수 (자정을 넘긴 운행은 2일로 센다) */
  usedDays: number;
  totalHours: number;
  distanceKm: number;
  /** 이용률(%) = 이용한 날 / 집계 창 일수 */
  utilizationPct: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 최근 N일 이용률 집계.
 *
 * 분모를 "시간(24h × N일)"이 아니라 **일수**로 잡았다: 법인 업무 차량은 하루 중 몇 시간을
 * 쓰느냐보다 "며칠 굴렀느냐"가 계약 유지/해지 판단에 쓰이는 숫자이고, 시간 기준으로 잡으면
 * 정상 운영 차량도 한 자릿수 %가 나와 화면에서 의미를 잃는다.
 */
export function summarizeUsage(
  trips: readonly UsageTrip[],
  windowDays: number = FLEET_USAGE_WINDOW_DAYS,
): FleetUsage {
  const days = new Set<number>();
  let totalMs = 0;
  let distanceKm = 0;

  for (const trip of trips) {
    const start = new Date(trip.startAt);
    const end = new Date(trip.endAt);
    totalMs += Math.max(0, end.getTime() - start.getTime());
    distanceKm += trip.distanceKm ?? 0;
    for (let day = kstDayIndex(start); day <= kstDayIndex(end); day++) days.add(day);
  }

  const usedDays = days.size;
  return {
    windowDays,
    tripCount: trips.length,
    usedDays,
    totalHours: round1(totalMs / (60 * 60 * 1000)),
    distanceKm: round1(distanceKm),
    utilizationPct: windowDays > 0 ? round1((usedDays / windowDays) * 100) : 0,
  };
}

// ─────────────────────────── 요청 DTO ───────────────────────────

/** `POST /biz/leases/:id/extend-request` — 희망 만기는 현재 만기 이후여야 한다(서버가 재확인) */
export const extendLeaseRequestSchema = z.object({
  requestedEndAt: z.string().datetime({ offset: true }),
  note: z.string().max(200).optional(),
});
export type ExtendLeaseRequestDto = z.infer<typeof extendLeaseRequestSchema>;

/** `POST /biz/leases/:id/terminate-request` */
export const terminateLeaseRequestSchema = z.object({
  note: z.string().max(200).optional(),
});
export type TerminateLeaseRequestDto = z.infer<typeof terminateLeaseRequestSchema>;

/** `POST /ops/leases/:id/approve` */
export const approveLeaseRequestSchema = z.object({
  note: z.string().max(200).optional(),
});
export type ApproveLeaseRequestDto = z.infer<typeof approveLeaseRequestSchema>;

/** `POST /ops/leases/:id/reject` */
export const rejectLeaseRequestSchema = z.object({
  reason: z.string().min(1).max(200),
});
export type RejectLeaseRequestDto = z.infer<typeof rejectLeaseRequestSchema>;
