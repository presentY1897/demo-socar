/**
 * 차종별 매뉴얼 엔드포인트(M1-6) 통합 테스트.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용
 *   pnpm db:up && pnpm --filter @socar/api db:deploy && pnpm --filter @socar/api test:int
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

describe('차종별 매뉴얼 (통합) — GET /vehicles/:id/manual', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let evId: string;
  let gasId: string;
  let unknownModelId: string;
  let corpVehicleId: string;

  const stamp = Date.now();
  const planName = `manual-plan-${stamp}`;
  const zoneName = `manual-zone-${stamp}`;
  const corpName = `manual-corp-${stamp}`;
  const plateOf = (n: number) => `77머${(stamp + n) % 10000}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: planName, baseHourlyKrw: 6000, weekendHourlyKrw: 7500, perKmKrw: 200,
        insuranceLightKrw: 700, insuranceStandardKrw: 1400, insuranceFullKrw: 2200,
      },
    });
    const zone = await prisma.zone.create({
      data: { name: zoneName, region: 'seoul', address: '테스트', lat: 37.5, lng: 127.03, capacity: 4 },
    });
    const corp = await prisma.corporation.create({
      data: { name: corpName, officeAddress: '테스트 사옥', officeLat: 37.5, officeLng: 127.03 },
    });

    const vehicle = (modelName: string, fuel: 'EV' | 'GASOLINE', n: number, corporationId?: string) =>
      prisma.vehicle.create({
        data: {
          modelName, plateNo: plateOf(n), fuel, seats: 5,
          zoneId: zone.id, planId: plan.id, corporationId: corporationId ?? null,
        },
      });

    const [ev, gas, unknown, corpVehicle] = await Promise.all([
      vehicle('아이오닉 5', 'EV', 1),
      vehicle('아반떼', 'GASOLINE', 2),
      vehicle('모카르 컨셉트', 'EV', 3),
      vehicle('카니발', 'GASOLINE', 4, corp.id),
    ]);
    evId = ev.id;
    gasId = gas.id;
    unknownModelId = unknown.id;
    corpVehicleId = corpVehicle.id;
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany({
      where: { id: { in: [evId, gasId, unknownModelId, corpVehicleId] } },
    });
    await prisma.corporation.deleteMany({ where: { name: corpName } });
    await prisma.zone.deleteMany({ where: { name: zoneName } });
    await prisma.pricingPlan.deleteMany({ where: { name: planName } });
    await app.close();
  });

  const manual = (id: string) => request(app.getHttpServer()).get(`/vehicles/${id}/manual`);

  it('로그인 없이도 차량의 차종 매뉴얼을 볼 수 있다', async () => {
    const res = await manual(evId);
    expect(res.status).toBe(200);
    expect(res.body.vehicleId).toBe(evId);
    expect(res.body.modelName).toBe('아이오닉 5');
    expect(res.body.fuel).toBe('EV');
    expect(res.body.tagline.length).toBeGreaterThan(0);
    expect(res.body.sections.length).toBeGreaterThanOrEqual(5);
  });

  it('전기차와 내연기관 차의 시동·연료 섹션 내용이 서로 다르다', async () => {
    const [ev, gas] = await Promise.all([manual(evId), manual(gasId)]);
    expect(gas.body.fuel).toBe('GASOLINE');

    const section = (body: { sections: { title: string; body: string }[] }, title: string) =>
      body.sections.find((s) => s.title === title)!.body;

    expect(section(ev.body, '주유 · 충전')).toContain('충전구');
    expect(section(gas.body, '주유 · 충전')).toContain('주유구');
    expect(section(ev.body, '주유 · 충전')).not.toBe(section(gas.body, '주유 · 충전'));

    expect(section(ev.body, '시동 걸기 / 기어')).toContain('READY');
    expect(section(ev.body, '시동 걸기 / 기어')).not.toBe(section(gas.body, '시동 걸기 / 기어'));

    expect(section(ev.body, '반납 전 체크리스트')).toContain('배터리 잔량');
    expect(section(gas.body, '반납 전 체크리스트')).toContain('연료 게이지');

    expect(ev.body.tagline).not.toBe(gas.body.tagline);
  });

  it('매뉴얼이 없는 차종도 연료 타입에 맞는 기본 안내로 대체된다', async () => {
    const res = await manual(unknownModelId);
    expect(res.status).toBe(200);
    expect(res.body.modelName).toBe('모카르 컨셉트');
    expect(res.body.fuel).toBe('EV');
    const refuel = res.body.sections.find(
      (s: { title: string }) => s.title === '주유 · 충전',
    ).body;
    expect(refuel).toContain('충전');
    expect(refuel).not.toContain('주유구');
  });

  it('없는 차량은 404', async () => {
    const res = await manual('vehicle-does-not-exist');
    expect(res.status).toBe(404);
  });

  it('법인 전용 차량은 공개 API에서 404', async () => {
    const res = await manual(corpVehicleId);
    expect(res.status).toBe(404);
  });
});
