import { describe, expect, it } from 'vitest';
import { usageCheckedIn, usageCheckedOut, usageEmpty } from '@/test/msw/fixtures';
import { pickActiveReservation, progressState, rentalStage } from '../rental-stage';

const inUse = { status: 'IN_USE', rental: { status: 'IN_USE' } };

describe('rentalStage — 이용 화면이 지금 보여줄 한 단계', () => {
  it('대여가 없으면 이용 전, 취소된 예약은 취소다', () => {
    expect(rentalStage({ status: 'CONFIRMED', rental: null }, undefined)).toBe('BEFORE_START');
    expect(rentalStage({ status: 'CANCELED', rental: null }, undefined)).toBe('CANCELED');
  });

  it('이용 중에는 체크인 → 이용 중 → 반납 순서로 넘어간다', () => {
    expect(rentalStage(inUse, usageEmpty)).toBe('CHECK_IN');
    expect(rentalStage(inUse, usageCheckedIn)).toBe('DRIVING');
    expect(rentalStage(inUse, usageCheckedOut)).toBe('RETURN');
  });

  it('이용 기록이 아직 안 왔으면 단계를 정하지 않는다 — 체크인한 사람에게 체크인 폼이 번쩍이지 않게', () => {
    expect(rentalStage(inUse, undefined)).toBeNull();
  });

  it('정산이 실패한 반납 대기는 반납 화면에 머물고, 정산까지 끝나면 완료다', () => {
    expect(rentalStage({ status: 'IN_USE', rental: { status: 'RETURN_PENDING' } }, undefined)).toBe('RETURN');
    expect(rentalStage({ status: 'COMPLETED', rental: { status: 'COMPLETED' } }, undefined)).toBe('DONE');
  });
});

describe('progressState — 진행 표시줄', () => {
  it('현재 칸 앞은 완료, 뒤는 대기다', () => {
    expect(progressState('CHECK_IN', 'DRIVING')).toBe('done');
    expect(progressState('DRIVING', 'DRIVING')).toBe('current');
    expect(progressState('RETURN', 'DRIVING')).toBe('todo');
  });

  it('이용을 마치면 세 칸 모두 완료다', () => {
    expect(progressState('RETURN', 'DONE')).toBe('done');
  });
});

describe('pickActiveReservation — 홈이 지도 대신 보여줄 예약', () => {
  const row = (id: string, status: string, startedAt: string | null) => ({
    id,
    status,
    rental: startedAt ? { status: 'IN_USE', startedAt } : null,
  });

  it('이용 중인 예약이 없으면 null — 홈은 지도다', () => {
    expect(pickActiveReservation(undefined)).toBeNull();
    expect(pickActiveReservation([row('a', 'CONFIRMED', null), row('b', 'COMPLETED', null)])).toBeNull();
  });

  it('이용 중인 예약이 여럿이면 가장 최근에 시작한 것을 고른다', () => {
    const picked = pickActiveReservation([
      row('old', 'IN_USE', '2030-01-01T01:00:00.000Z'),
      row('new', 'IN_USE', '2030-01-02T01:00:00.000Z'),
      row('soon', 'CONFIRMED', null),
    ]);
    expect(picked?.id).toBe('new');
  });
});
