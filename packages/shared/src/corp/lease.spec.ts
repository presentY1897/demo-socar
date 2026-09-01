import { describe, expect, it } from 'vitest';
import {
  FLEET_USAGE_WINDOW_DAYS,
  LEASE_EXPIRY_WARNING_DAYS,
  LEASE_STATUS_LABELS,
  LeaseStatus,
  extendLeaseRequestSchema,
  isLeaseExpiringSoon,
  isLeasePending,
  leaseDDay,
  rejectLeaseRequestSchema,
  summarizeUsage,
} from './lease';

/** KST 자정 기준으로 비교하는지 보려고 경계 시각을 직접 만든다 */
const kst = (iso: string) => new Date(`${iso}+09:00`);

describe('leaseDDay — 만기까지 남은 일수', () => {
  it('KST 달력 날짜 차이로 센다 (시각 차이가 아니다)', () => {
    // 오늘 23:00 → 내일 01:00 은 2시간 차이지만 D-1
    expect(leaseDDay(kst('2026-09-02T01:00:00'), kst('2026-09-01T23:00:00'))).toBe(1);
    // 같은 날이면 D-0
    expect(leaseDDay(kst('2026-09-01T23:59:00'), kst('2026-09-01T00:01:00'))).toBe(0);
  });

  it('만기가 지났으면 음수', () => {
    expect(leaseDDay(kst('2026-08-30T10:00:00'), kst('2026-09-01T10:00:00'))).toBe(-2);
  });

  it('UTC 자정 근처에서도 KST 날짜로 갈린다', () => {
    // 2026-09-01T15:30Z = KST 2026-09-02 00:30 → 이미 다음 날
    expect(leaseDDay(new Date('2026-09-02T00:00:00Z'), new Date('2026-09-01T15:30:00Z'))).toBe(0);
  });

  it('임박 기준은 D-30 이내 (지난 계약 포함)', () => {
    expect(isLeaseExpiringSoon(LEASE_EXPIRY_WARNING_DAYS)).toBe(true);
    expect(isLeaseExpiringSoon(LEASE_EXPIRY_WARNING_DAYS + 1)).toBe(false);
    expect(isLeaseExpiringSoon(-3)).toBe(true);
  });
});

describe('summarizeUsage — 최근 N일 이용률', () => {
  const trip = (start: string, end: string, distanceKm?: number) => ({
    startAt: kst(start),
    endAt: kst(end),
    distanceKm,
  });

  it('이용한 날 수 / 집계 창 일수로 이용률을 낸다', () => {
    const usage = summarizeUsage(
      [
        trip('2026-08-10T09:00:00', '2026-08-10T12:00:00', 30),
        trip('2026-08-12T09:00:00', '2026-08-12T11:30:00', 20.5),
        trip('2026-08-20T14:00:00', '2026-08-20T15:00:00'),
      ],
      30,
    );

    expect(usage).toEqual({
      windowDays: 30,
      tripCount: 3,
      usedDays: 3,
      totalHours: 6.5,
      distanceKm: 50.5,
      utilizationPct: 10,
    });
  });

  it('같은 날 두 번 타면 이용일은 하루로 센다', () => {
    const usage = summarizeUsage(
      [
        trip('2026-08-10T09:00:00', '2026-08-10T10:00:00'),
        trip('2026-08-10T18:00:00', '2026-08-10T20:00:00'),
      ],
      10,
    );
    expect(usage.tripCount).toBe(2);
    expect(usage.usedDays).toBe(1);
    expect(usage.utilizationPct).toBe(10);
  });

  it('자정을 넘긴 운행은 이틀로 센다', () => {
    const usage = summarizeUsage([trip('2026-08-10T22:00:00', '2026-08-11T02:00:00')], 30);
    expect(usage.usedDays).toBe(2);
    expect(usage.totalHours).toBe(4);
  });

  it('운행이 없으면 0%', () => {
    expect(summarizeUsage([], FLEET_USAGE_WINDOW_DAYS)).toMatchObject({
      tripCount: 0,
      usedDays: 0,
      totalHours: 0,
      utilizationPct: 0,
    });
  });

  it('집계 창이 0이면 나눗셈 대신 0% (방어)', () => {
    expect(summarizeUsage([trip('2026-08-10T09:00:00', '2026-08-10T10:00:00')], 0)).toMatchObject({
      usedDays: 1,
      utilizationPct: 0,
    });
  });
});

describe('리스 상태', () => {
  it('처리 대기 상태만 pending이다', () => {
    expect(isLeasePending(LeaseStatus.EXTENSION_REQUESTED)).toBe(true);
    expect(isLeasePending(LeaseStatus.TERMINATION_REQUESTED)).toBe(true);
    expect(isLeasePending(LeaseStatus.ACTIVE)).toBe(false);
    expect(isLeasePending(LeaseStatus.ENDED)).toBe(false);
  });

  it('상태마다 화면 라벨이 있다', () => {
    for (const status of Object.values(LeaseStatus)) {
      expect(LEASE_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe('요청 DTO 스키마', () => {
  it('연장 요청은 오프셋이 있는 ISO 시각을 요구한다', () => {
    expect(
      extendLeaseRequestSchema.safeParse({ requestedEndAt: '2027-01-01T00:00:00+09:00' }).success,
    ).toBe(true);
    expect(extendLeaseRequestSchema.safeParse({ requestedEndAt: '2027-01-01' }).success).toBe(false);
  });

  it('반려는 사유가 필수다', () => {
    expect(rejectLeaseRequestSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(rejectLeaseRequestSchema.safeParse({ reason: '재고 회수 예정' }).success).toBe(true);
  });
});
