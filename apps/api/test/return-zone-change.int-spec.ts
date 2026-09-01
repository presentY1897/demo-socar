/**
 * 예약 변경 시 반납 존 변경(M1-5) 통합 테스트.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용
 *   pnpm db:up && pnpm --filter @socar/api db:deploy && pnpm --filter @socar/api test:int
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

describe('반납 존 변경 (통합) — 차액 정산 + 위치 체인', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  let vehicleId: string;
  let zoneStartId: string;
  let zoneNearId: string;
  let zoneFarId: string;
  let zoneBusanId: string;

  const stamp = Date.now();
  const email = `return-zone-${stamp}@test.mocar.kr`;
  const otherEmail = `return-zone-other-${stamp}@test.mocar.kr`;
  const planName = `return-zone-plan-${stamp}`;
  const zonePrefix = `return-zone-${stamp}`;

  // 내일 (KST) — 슬롯은 10분 단위여야 한다
  const day = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const kst = (hhmm: string) => `${day}T${hhmm}:00+09:00`;

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
    // 출발 존(강남) 기준: 가까운 존은 최소요금 5,000원 / 먼 존(노원)은 10km를 넘어 더 비싸다
    const zone = (name: string, region: string, lat: number, lng: number) =>
      prisma.zone.create({
        data: { name: `${zonePrefix}-${name}`, region, address: '테스트', lat, lng, capacity: 4 },
      });
    const [start, near, far, busan] = await Promise.all([
      zone('start', 'seoul', 37.4979, 127.0276),
      zone('near', 'seoul', 37.5665, 126.978),
      zone('far', 'seoul', 37.6584, 127.0605),
      zone('busan', 'busan', 35.1578, 129.0594),
    ]);
    zoneStartId = start.id;
    zoneNearId = near.id;
    zoneFarId = far.id;
    zoneBusanId = busan.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '테스트카', plateNo: `88테${stamp % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: start.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;

    const login = async (userEmail: string, name: string) => {
      await prisma.user.create({
        data: { email: userEmail, name, role: 'USER', passwordHash: await bcrypt.hash('test1234', 4) },
      });
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password: 'test1234' })
        .expect(201);
      return res.body.accessToken as string;
    };
    token = await login(email, '반납존변경');
    otherToken = await login(otherEmail, '남의예약');
  });

  afterEach(async () => {
    // 남은 예약이 다음 테스트의 위치 체인에 끼어들지 않도록 정리
    await prisma.payment.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.creditLedger.deleteMany({ where: { user: { email: { in: [email, otherEmail] } } } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: { startsWith: zonePrefix } } });
    await prisma.pricingPlan.deleteMany({ where: { name: planName } });
    await prisma.creditLedger.deleteMany({ where: { user: { email: { in: [email, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  const book = (from: string, to: string, overrides: Record<string, unknown> = {}, bearer = token) =>
    request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${bearer}`)
      .send({
        vehicleId,
        startAt: kst(from),
        endAt: kst(to),
        insurance: 'STANDARD',
        useCredit: false,
        cardLast4: '4242',
        idempotencyKey: randomUUID(),
        ...overrides,
      });

  const patch = (id: string, body: Record<string, unknown>, bearer = token) =>
    request(app.getHttpServer())
      .patch(`/reservations/${id}`)
      .set('Authorization', `Bearer ${bearer}`)
      .send({ idempotencyKey: randomUUID(), ...body });

  it('왕복 → 편도로 바꾸면 편도 수수료만큼 추가 결제된다', async () => {
    const created = await book('09:00', '11:00');
    expect(created.status).toBe(201);
    expect(created.body.onewayFeeKrw).toBe(0);
    const before = created.body.totalUpfrontKrw;

    const res = await patch(created.body.id, {
      startAt: kst('09:00'),
      endAt: kst('11:00'),
      returnZoneId: zoneFarId,
    });
    expect(res.status).toBe(200);
    expect(res.body.returnZoneId).toBe(zoneFarId);
    // 10km를 넘는 존이라 최소 수수료(5,000원)보다 비싸다
    expect(res.body.onewayFeeKrw).toBeGreaterThan(5000);
    expect(res.body.totalUpfrontKrw).toBe(before + res.body.onewayFeeKrw);

    // 차액은 추가 UPFRONT 결제로 승인된다
    const payments = await prisma.payment.findMany({
      where: { reservationId: created.body.id, kind: 'UPFRONT' },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments).toHaveLength(2);
    expect(payments[1].amountKrw).toBe(res.body.onewayFeeKrw);
    expect(payments[1].status).toBe('CAPTURED');
  });

  it('편도 → 왕복으로 되돌리면 수수료가 크레딧으로 환급된다', async () => {
    const created = await book('09:00', '11:00', { returnZoneId: zoneFarId });
    expect(created.status).toBe(201);
    const onewayFeeKrw = created.body.onewayFeeKrw;
    expect(onewayFeeKrw).toBeGreaterThan(5000);

    const res = await patch(created.body.id, {
      startAt: kst('09:00'),
      endAt: kst('11:00'),
      returnZoneId: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.returnZoneId).toBeNull();
    expect(res.body.onewayFeeKrw).toBe(0);
    expect(res.body.totalUpfrontKrw).toBe(created.body.totalUpfrontKrw - onewayFeeKrw);

    const refunds = await prisma.creditLedger.findMany({
      where: { reservationId: created.body.id, reason: 'REFUND' },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].deltaKrw).toBe(onewayFeeKrw);
  });

  it('가까운 존에서 먼 존으로 바꾸면 차액만 추가 결제된다', async () => {
    const created = await book('09:00', '11:00', { returnZoneId: zoneNearId });
    expect(created.body.onewayFeeKrw).toBe(5000); // 최소 수수료

    const res = await patch(created.body.id, {
      startAt: kst('09:00'),
      endAt: kst('11:00'),
      returnZoneId: zoneFarId,
    });
    expect(res.status).toBe(200);

    const payments = await prisma.payment.findMany({
      where: { reservationId: created.body.id, kind: 'UPFRONT' },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments).toHaveLength(2);
    expect(payments[1].amountKrw).toBe(res.body.onewayFeeKrw - 5000);
  });

  it('이후 예약의 출발 존이 달라지는 반납 존 변경은 409로 막힌다', async () => {
    const first = await book('09:00', '11:00');
    expect(first.status).toBe(201);
    // 같은 차량의 뒤 예약 — 지금은 출발 존에서 시작한다
    const second = await book('13:00', '15:00');
    expect(second.status).toBe(201);

    const res = await patch(first.body.id, {
      startAt: kst('09:00'),
      endAt: kst('11:00'),
      returnZoneId: zoneFarId,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('다음 예약');

    // 거부됐으니 예약도 결제도 그대로다
    const kept = await prisma.reservation.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(kept.returnZoneId).toBeNull();
    expect(kept.onewayFeeKrw).toBe(0);
    const payments = await prisma.payment.count({ where: { reservationId: first.body.id } });
    expect(payments).toBe(1);
  });

  it('뒤 예약이 취소되면 같은 변경이 통과한다', async () => {
    const first = await book('09:00', '11:00');
    const second = await book('13:00', '15:00');
    await request(app.getHttpServer())
      .post(`/reservations/${second.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const res = await patch(first.body.id, {
      startAt: kst('09:00'),
      endAt: kst('11:00'),
      returnZoneId: zoneFarId,
    });
    expect(res.status).toBe(200);
    expect(res.body.returnZoneId).toBe(zoneFarId);
  });

  it('다른 지역의 존으로는 반납 존을 바꿀 수 없다 (400)', async () => {
    const created = await book('09:00', '11:00');

    const res = await patch(created.body.id, {
      startAt: kst('09:00'),
      endAt: kst('11:00'),
      returnZoneId: zoneBusanId,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('같은 지역');
  });

  it('없는 존으로는 바꿀 수 없다 (404)', async () => {
    const created = await book('09:00', '11:00');

    const res = await patch(created.body.id, {
      startAt: kst('09:00'),
      endAt: kst('11:00'),
      returnZoneId: 'zone-does-not-exist',
    });
    expect(res.status).toBe(404);
  });

  it('남의 예약은 반납 존을 바꿀 수 없다 (403)', async () => {
    const created = await book('09:00', '11:00');

    const res = await patch(
      created.body.id,
      { startAt: kst('09:00'), endAt: kst('11:00'), returnZoneId: zoneNearId },
      otherToken,
    );
    expect(res.status).toBe(403);
  });

  it('반납 존을 생략한 시간 변경은 기존 편도 설정을 유지한다', async () => {
    const created = await book('09:00', '11:00', { returnZoneId: zoneNearId });

    const res = await patch(created.body.id, { startAt: kst('09:00'), endAt: kst('12:00') });
    expect(res.status).toBe(200);
    expect(res.body.returnZoneId).toBe(zoneNearId);
    expect(res.body.onewayFeeKrw).toBe(5000);
  });

  it('출발 존과 같은 존을 고르면 왕복으로 정리된다', async () => {
    const created = await book('09:00', '11:00', { returnZoneId: zoneNearId });

    const res = await patch(created.body.id, {
      startAt: kst('09:00'),
      endAt: kst('11:00'),
      returnZoneId: zoneStartId,
    });
    expect(res.status).toBe(200);
    expect(res.body.returnZoneId).toBeNull();
    expect(res.body.onewayFeeKrw).toBe(0);
  });
});
