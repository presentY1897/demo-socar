import { rankCandidates, scoreCandidate } from './scoring';
import type { CandidateInput } from './scoring';

const base: CandidateInput = {
  vehicleId: 'v1',
  zoneName: '성수역 2번 출구',
  walkSeconds: 300, // 5분
  walkMeters: 380,
  travelMethod: 'graph-astar',
  bufferMinutes: null,
  lateRiskPct: 0,
};

describe('scoreCandidate', () => {
  it('가깝고 앞 예약이 없고 리스크가 없으면 만점에 가깝다', () => {
    const c = scoreCandidate(base);
    expect(c.score).toBeGreaterThan(90);
    expect(c.reasons.some((r) => r.includes('도보 약 5분'))).toBe(true);
    expect(c.reasons).toContain('해당 시간대 앞 예약 없음');
  });

  it('도보 30분 이상이면 이동시간 점수는 0이 된다 (0분 대비 walk 가중치 50점 차이)', () => {
    const instant = scoreCandidate({ ...base, walkSeconds: 0, walkMeters: 0 });
    const far = scoreCandidate({ ...base, walkSeconds: 2400, walkMeters: 3000 });
    expect(instant.score - far.score).toBeCloseTo(50, 1);
  });

  it('반납 버퍼가 15분 미만이면 경고 근거를 붙인다', () => {
    const c = scoreCandidate({ ...base, bufferMinutes: 10 });
    expect(c.reasons.some((r) => r.includes('반납이 지연되면'))).toBe(true);
  });

  it('지연 반납률 20% 이상이면 경고 근거를 붙인다', () => {
    const c = scoreCandidate({ ...base, lateRiskPct: 35 });
    expect(c.reasons.some((r) => r.startsWith('⚠') && r.includes('35%'))).toBe(true);
  });

  it('직선거리 폴백이면 근거에 추정 방식을 명시한다', () => {
    const c = scoreCandidate({ ...base, travelMethod: 'haversine' });
    expect(c.reasons[0]).toContain('직선거리 추정');
  });
});

describe('rankCandidates', () => {
  it('점수 내림차순으로 rank를 부여한다', () => {
    const ranked = rankCandidates([
      { ...base, vehicleId: 'far', walkSeconds: 1500, walkMeters: 1800 },
      { ...base, vehicleId: 'near' },
      { ...base, vehicleId: 'risky', lateRiskPct: 60 },
    ]);
    expect(ranked[0].vehicleId).toBe('near');
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
  });
});
