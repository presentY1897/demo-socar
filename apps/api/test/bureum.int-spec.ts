/**
 * 부름(탁송 배달) 통합 테스트 — 요금 포함 결제, 리드타임/반경/탁송시간 제약, 편도 조합 금지.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

function nextSlot(offsetMinutes = 0): Date {
  const t = new Date();
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 10) * 10 + offsetMinutes);
  return t;
}
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

// 성수역 인근 (seoul 도로망 그래프 커버 영역)
const ZONE_POS = { lat: 37.544579, lng: 127.055961 };
const NEAR_POS = { lat: 37.5405, lng: 127.0505, label: '회사 정문 앞' };
const FAR_POS = { lat: 37.7, lng: 127.2, label: '반경 밖' };

describe('부름 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let vehicleId: string;
  let otherZoneId: string;
  const email = `bureum-${Date.now()}@test.mocar.kr`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: 'bureum-test', baseHourlyKrw: 6000, weekendHourlyKrw: 6000, perKmKrw: 200,
        insuranceLightKrw: 600, insuranceStandardKrw: 1200, insuranceFullKrw: 1800,
      },
    });
    const zone = await prisma.zone.create({
      data: { name: 'bureum-zone', region: 'seoul', address: '성수', ...ZONE_POS, capacity: 2 },
    });
    const other = await prisma.zone.create({
      data: { name: 'bureum-zone-b', region: 'seoul', address: 'B', lat: 37.5441, lng: 127.0376, capacity: 2 },
    });
    otherZoneId = other.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '부름테스트카', plateNo: `97테${Date.now() % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zone.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;

    await prisma.user.create({
      data: { email, name: '부름테스트', role: 'USER', passwordHash: await bcrypt.hash('test1234', 4) },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'test1234' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.rental.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: { in: ['bureum-zone', 'bureum-zone-b'] } } });
    await prisma.pricingPlan.deleteMany({ where: { name: 'bureum-test' } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const book = (startAt: Date, endAt: Date, extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vehicleId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        insurance: 'LIGHT',
        useCredit: false,
        cardLast4: '4242',
        idempotencyKey: randomUUID(),
        ...extra,
      });

  it('부름 예약: 탁송 요금이 선결제에 포함된다', async () => {
    const start = nextSlot(90); // 리드타임 60분 충족
    const res = await book(start, addMin(start, 60), { delivery: NEAR_POS });
    expect(res.status).toBe(201);
    expect(res.body.deliveryLabel).toBe(NEAR_POS.label);
    expect(res.body.deliveryFeeKrw).toBeGreaterThanOrEqual(6000);
    expect(res.body.totalUpfrontKrw).toBe(
      res.body.rentalFeeKrw + res.body.insuranceFeeKrw + res.body.deliveryFeeKrw,
    );

    // 부름 예약은 시간 변경 미지원
    const mod = await request(app.getHttpServer())
      .patch(`/reservations/${res.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startAt: addMin(start, 10).toISOString(),
        endAt: addMin(start, 70).toISOString(),
        idempotencyKey: randomUUID(),
      });
    expect(mod.status).toBe(400);

    await request(app.getHttpServer())
      .post(`/reservations/${res.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });

  it('리드타임 60분 미만이면 거절한다', async () => {
    const start = nextSlot(20);
    const res = await book(start, addMin(start, 60), { delivery: NEAR_POS });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('60분');
  });

  it('존 반경 5km 밖 배달지는 거절한다', async () => {
    const start = nextSlot(90);
    const res = await book(start, addMin(start, 60), { delivery: FAR_POS });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('반경');
  });

  it('부름과 편도는 함께 쓸 수 없다', async () => {
    const start = nextSlot(90);
    const res = await book(start, addMin(start, 60), {
      delivery: NEAR_POS,
      returnZoneId: otherZoneId,
    });
    expect(res.status).toBe(400);
  });

  it('직전 반납과의 간격이 탁송+준비 시간보다 짧으면 409', async () => {
    const start = nextSlot(120);
    // 직전 예약: 부름 시작 10분 전 반납 → 탁송(도로망 기준 수 분) + 준비 20분 부족
    const prev = await book(addMin(start, -40), addMin(start, -10));
    expect(prev.status).toBe(201);

    const res = await book(start, addMin(start, 60), { delivery: NEAR_POS });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('탁송');

    await request(app.getHttpServer())
      .post(`/reservations/${prev.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });
});
