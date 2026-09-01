import { rankHandlerCandidates, type HandlerCandidateInput } from './handler-recommend';

/** 성수역 = 이 작업의 출발지 */
const ORIGIN = { lat: 37.544579, lng: 127.055961 };
const NEAR = { label: '뚝섬역', lat: 37.547189, lng: 127.047478 }; // 약 0.8km
const FAR = { label: '홍대입구역', lat: 37.557527, lng: 126.9244669 }; // 약 11km

const candidate = (over: Partial<HandlerCandidateInput> = {}): HandlerCandidateInput => ({
  handlerId: 'h1',
  name: '한기사',
  lastPlace: null,
  lastCompletedAt: null,
  activeTaskCount: 0,
  ...over,
});

describe('배정 추천 (rankHandlerCandidates)', () => {
  it('마지막 완료 지점이 가까운 핸들러가 앞에 온다', () => {
    const ranked = rankHandlerCandidates(
      [
        candidate({ handlerId: 'far', lastPlace: FAR }),
        candidate({ handlerId: 'near', lastPlace: NEAR }),
      ],
      ORIGIN,
    );
    expect(ranked.map((c) => c.handlerId)).toEqual(['near', 'far']);
    expect(ranked[0].distanceMeters).toBeLessThan(ranked[1].distanceMeters!);
  });

  it('완주 기록이 없는 핸들러는 거리를 알 수 없어 뒤로, 원래 순서를 유지한다', () => {
    const ranked = rankHandlerCandidates(
      [
        candidate({ handlerId: 'unknown-a' }),
        candidate({ handlerId: 'far', lastPlace: FAR }),
        candidate({ handlerId: 'unknown-b' }),
        candidate({ handlerId: 'near', lastPlace: NEAR }),
      ],
      ORIGIN,
    );
    expect(ranked.map((c) => c.handlerId)).toEqual(['near', 'far', 'unknown-a', 'unknown-b']);
    expect(ranked[2].distanceMeters).toBeNull();
    expect(ranked[2].reasons[0]).toContain('기본 순서');
  });

  it('근거에 마지막 완료 지점과 진행 중 작업 수를 함께 적는다', () => {
    const [only] = rankHandlerCandidates(
      [
        candidate({
          lastPlace: NEAR,
          lastCompletedAt: new Date('2026-09-01T02:00:00.000Z'),
          activeTaskCount: 3,
        }),
      ],
      ORIGIN,
    );
    expect(only.lastPlaceLabel).toBe('뚝섬역');
    expect(only.lastCompletedAt).toBe('2026-09-01T02:00:00.000Z');
    expect(only.reasons[0]).toContain('뚝섬역');
    expect(only.reasons[1]).toBe('진행 중인 작업 3건');
    // 이미 여러 건을 쥔 핸들러는 순서와 별개로 경고를 남긴다 — 판단은 운영자가 한다
    expect(only.reasons[2]).toContain('⚠');
  });

  it('한가한 핸들러도 거리가 멀면 뒤로 간다 — 순서 기준은 거리 하나다', () => {
    const ranked = rankHandlerCandidates(
      [
        candidate({ handlerId: 'idle-far', lastPlace: FAR, activeTaskCount: 0 }),
        candidate({ handlerId: 'busy-near', lastPlace: NEAR, activeTaskCount: 2 }),
      ],
      ORIGIN,
    );
    expect(ranked.map((c) => c.handlerId)).toEqual(['busy-near', 'idle-far']);
  });
});
