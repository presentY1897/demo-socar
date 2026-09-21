/**
 * 예약 동시성 + 결제 멱등성 통합 테스트.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용
 *   pnpm db:up && pnpm --filter @socar/api db:deploy && pnpm --filter @socar/api test:int
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { SLOT_MS } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

describe('예약 동시성/멱등성 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let vehicleId: string;
  const email = `int-test-${Date.now()}@test.mocar.kr`;

  // 내일 14:00~16:00 (KST)
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const day = tomorrow.toISOString().slice(0, 10);
  const startAt = `${day}T14:00:00+09:00`;
  const endAt = `${day}T16:00:00+09:00`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // 테스트 전용 픽스처 (기존 시드와 독립)
    const plan = await prisma.pricingPlan.create({
      data: {
        name: 'int-test', baseHourlyKrw: 6000, weekendHourlyKrw: 7500, perKmKrw: 200,
        insuranceLightKrw: 700, insuranceStandardKrw: 1400, insuranceFullKrw: 2200,
      },
    });
    const zone = await prisma.zone.create({
      data: {
        name: 'int-test-zone', region: 'seoul', address: '테스트',
        lat: 37.5445, lng: 127.0559, capacity: 2,
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '테스트카', plateNo: `99테${Date.now() % 10000}`,
        fuel: 'EV', seats: 5, zoneId: zone.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;

    await prisma.user.create({
      data: {
        email, name: '통합테스트', role: 'USER',
        passwordHash: await bcrypt.hash('test1234', 4),
      },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'test1234' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    // 테스트 데이터 정리 (역순)
    await prisma.payment.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.rental.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: 'int-test-zone' } });
    await prisma.pricingPlan.deleteMany({ where: { name: 'int-test' } });
    await prisma.creditLedger.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const book = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vehicleId,
        startAt,
        endAt,
        insurance: 'STANDARD',
        useCredit: false,
        cardLast4: '4242',
        idempotencyKey: randomUUID(),
        ...overrides,
      });

  it('같은 시간대 동시 요청 10건 중 정확히 1건만 성공한다', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => book()));
    const created = results.filter((r: request.Response) => r.status === 201);
    const conflicted = results.filter((r: request.Response) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicted).toHaveLength(9);

    // DB에도 유효 예약은 정확히 1건
    const count = await prisma.reservation.count({
      where: { vehicleId, status: { in: ['CONFIRMED', 'IN_USE'] } },
    });
    expect(count).toBe(1);
  });

  it('성공한 예약과 겹치는 다른 구간도 차단된다 (부분 겹침)', async () => {
    const res = await book({
      startAt: `${day}T15:00:00+09:00`,
      endAt: `${day}T17:00:00+09:00`,
    });
    expect(res.status).toBe(409);
  });

  it('카드 승인 거절(0000) 시 예약이 생성되지 않고 롤백된다', async () => {
    const res = await book({
      startAt: `${day}T18:00:00+09:00`,
      endAt: `${day}T19:00:00+09:00`,
      cardLast4: '0000',
    });
    expect(res.status).toBe(400);
    const count = await prisma.reservation.count({
      where: { vehicleId, startAt: new Date(`${day}T18:00:00+09:00`) },
    });
    expect(count).toBe(0);
  });

  it('취소하면 슬롯이 풀려 재예약이 가능하다', async () => {
    const slot = { startAt: `${day}T20:00:00+09:00`, endAt: `${day}T21:00:00+09:00` };
    const first = await book(slot);
    expect(first.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/reservations/${first.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const second = await book(slot);
    expect(second.status).toBe(201);
  });

  it('멱등성 키를 다른 결제에 재사용하면 거절된다', async () => {
    const key = randomUUID();
    const first = await book({
      startAt: `${day}T09:00:00+09:00`,
      endAt: `${day}T10:00:00+09:00`,
      idempotencyKey: key,
    });
    expect(first.status).toBe(201);

    const second = await book({
      startAt: `${day}T10:00:00+09:00`,
      endAt: `${day}T11:00:00+09:00`,
      idempotencyKey: key,
    });
    expect(second.status).toBe(400);
  });

  it('이미 시작된 현재 슬롯으로 예약하면 받고 곧바로 이용 시작된다 — 지나간 슬롯은 400', async () => {
    const slotNow = () => Math.floor(Date.now() / SLOT_MS) * SLOT_MS;
    const range = (slot: number) => ({
      startAt: new Date(slot).toISOString(),
      endAt: new Date(slot + 6 * SLOT_MS).toISOString(),
    });

    // 현재 슬롯보다 앞선 슬롯은 과거다
    const past = await book(range(slotNow() - SLOT_MS));
    expect(past.status).toBe(400);

    // 현재 슬롯은 이미 시작됐어도 받는다 — 기본 이용 시간이 "다음 슬롯"이라 결제 도중 시작되기 쉽다
    let slot = slotNow();
    let res = await book(range(slot));
    if (res.status === 400 && slotNow() !== slot) {
      // 요청 도중 슬롯 경계를 넘었다 — 새 현재 슬롯으로 한 번 더
      slot = slotNow();
      res = await book(range(slot));
    }
    expect(res.status).toBe(201);

    await request(app.getHttpServer())
      .post('/rentals/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ reservationId: res.body.id })
      .expect(201);
  });
});
