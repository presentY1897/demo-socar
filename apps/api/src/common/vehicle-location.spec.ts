import { effectiveZoneIdAt } from './vehicle-location';

const at = (h: number) => new Date(`2026-09-02T${String(h).padStart(2, '0')}:00:00+09:00`);

describe('effectiveZoneIdAt — 편도 위치 체인', () => {
  it('예약이 없으면 물리적 현재 존', () => {
    expect(effectiveZoneIdAt('A', [], at(12))).toBe('A');
  });

  it('t 이전에 끝난 편도 예약만큼 이동한다', () => {
    const chain = [
      { endAt: at(10), returnZoneId: 'B' },
      { endAt: at(14), returnZoneId: 'C' },
    ];
    expect(effectiveZoneIdAt('A', chain, at(9))).toBe('A');
    expect(effectiveZoneIdAt('A', chain, at(12))).toBe('B');
    expect(effectiveZoneIdAt('A', chain, at(15))).toBe('C');
  });

  it('왕복 예약(returnZoneId=null)은 위치를 바꾸지 않는다', () => {
    const chain = [
      { endAt: at(10), returnZoneId: 'B' },
      { endAt: at(12), returnZoneId: null },
    ];
    expect(effectiveZoneIdAt('A', chain, at(13))).toBe('B');
  });

  it('정렬되지 않은 입력도 시간순으로 적용한다', () => {
    const chain = [
      { endAt: at(14), returnZoneId: 'C' },
      { endAt: at(10), returnZoneId: 'B' },
    ];
    expect(effectiveZoneIdAt('A', chain, at(15))).toBe('C');
  });
});
