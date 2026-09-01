import { MANUAL_MODEL_NAMES, getVehicleManual } from './vehicle-manual';

const bodyOf = (modelName: string, title: string) =>
  getVehicleManual(modelName).sections.find((s) => s.title === title)!.body;

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

  it('시동·주유/충전·공조·특징이 차종마다 채워진다', () => {
    const required = ['시동 걸기 / 기어', '주유 · 충전', '공조 · 편의 기능', '이 차의 특징'];
    for (const modelName of MANUAL_MODEL_NAMES) {
      const titles = getVehicleManual(modelName).sections.map((s) => s.title);
      for (const title of required) expect(titles).toContain(title);
    }
  });

  it('전기차와 내연기관 차의 주유·충전 안내가 다르다', () => {
    const ev = bodyOf('아이오닉 5', '주유 · 충전');
    const gas = bodyOf('아반떼', '주유 · 충전');
    expect(ev).toContain('충전구');
    expect(gas).toContain('주유구');
    expect(ev).not.toBe(gas);
  });

  it('반납 전 체크리스트는 연료 타입에 따라 달라진다', () => {
    expect(bodyOf('아이오닉 5', '반납 전 체크리스트')).toContain('배터리 잔량 30%');
    expect(bodyOf('아반떼', '반납 전 체크리스트')).toContain('연료 게이지');
    // 공통 항목은 그대로 공유한다
    expect(bodyOf('아반떼', '반납 전 체크리스트')).toContain('개인 물품');
  });

  it('등록되지 않은 차종은 연료 타입에 맞는 기본 매뉴얼로 대체된다', () => {
    const gas = getVehicleManual('테스트카');
    expect(gas.modelName).toBe('테스트카');
    expect(gas.fuel).toBe('GASOLINE');
    expect(gas.sections.length).toBeGreaterThanOrEqual(5);

    const ev = getVehicleManual('테스트EV', 'EV');
    expect(ev.fuel).toBe('EV');
    expect(ev.sections.find((s) => s.title === '주유 · 충전')!.body).toContain('충전 카드');
    expect(ev.sections.find((s) => s.title === '반납 전 체크리스트')!.body).toContain('배터리 잔량');
  });

  it('등록된 차종은 인자로 준 연료보다 자기 차종 정의를 따른다', () => {
    // 시드 데이터가 어긋나도 콘텐츠가 뒤섞이지 않게 — 매뉴얼 본문은 차종이 진실
    expect(getVehicleManual('아이오닉 5', 'EV').fuel).toBe('EV');
    expect(getVehicleManual('쏘렌토').fuel).toBe('HYBRID');
  });
});
