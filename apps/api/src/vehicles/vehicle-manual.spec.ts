import { MANUAL_MODEL_NAMES, getVehicleManual } from './vehicle-manual';

describe('차종별 매뉴얼 모의 콘텐츠', () => {
  it('등록된 차종은 모두 고유한 소개 문구와 본문을 가진다', () => {
    expect(MANUAL_MODEL_NAMES.length).toBeGreaterThanOrEqual(8);

    const taglines = MANUAL_MODEL_NAMES.map((m) => getVehicleManual(m).tagline);
    expect(new Set(taglines).size).toBe(MANUAL_MODEL_NAMES.length);

    for (const modelName of MANUAL_MODEL_NAMES) {
      const manual = getVehicleManual(modelName);
      expect(manual.modelName).toBe(modelName);
      expect(manual.sections.length).toBeGreaterThanOrEqual(5);
      for (const s of manual.sections) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.body.length).toBeGreaterThan(0);
      }
    }
  });

  it('전기차와 내연기관 차의 주유·충전 안내가 다르다', () => {
    const ev = getVehicleManual('아이오닉 5').sections.find((s) => s.title === '주유 · 충전')!;
    const gas = getVehicleManual('아반떼').sections.find((s) => s.title === '주유 · 충전')!;
    expect(ev.body).toContain('충전구');
    expect(gas.body).toContain('주유구');
    expect(ev.body).not.toBe(gas.body);
  });

  it('등록되지 않은 차종은 기본 매뉴얼로 대체된다', () => {
    const manual = getVehicleManual('테스트카');
    expect(manual.modelName).toBe('테스트카');
    expect(manual.sections.length).toBeGreaterThanOrEqual(5);
  });
});
