/**
 * 대여 라이프사이클 통합 테스트 — 연장 충돌, 편도 반납 존 이동, 예약 변경 차액.
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

/** 다음 10분 경계 (지금 이후) */
function nextSlot(offsetMinutes = 0): Date {
  const t = new Date();
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 10) * 10 + offsetMinutes);
  return t;
}
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

describe('라이프사이클 (통합) — 연장/편도/변경', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let vehicleId: string;
  let zoneAId: string;
  let zoneBId: string;
  const email = `lifecycle-${Date.now()}@test.mocar.kr`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: 'lifecycle-test', baseHourlyKrw: 6000, weekendHourlyKrw: 6000, perKmKrw: 200,
        insuranceLightKrw: 600, insuranceStandardKrw: 1200, insuranceFullKrw: 1800,
      },
    });
    const zoneA = await prisma.zone.create({
      data: { name: 'lc-zone-a', region: 'seoul', address: 'A', lat: 37.5445, lng: 127.0559, capacity: 2 },
    });
    const zoneB = await prisma.zone.create({
      data: { name: 'lc-zone-b', region: 'seoul', address: 'B', lat: 37.5441, lng: 127.0376, capacity: 2 },
    });
    zoneAId = zoneA.id;
    zoneBId = zoneB.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '테스트카LC', plateNo: `98테${Date.now() % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zoneA.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;

    await prisma.user.create({
      data: { email, name: '라이프사이클', role: 'USER', passwordHash: await bcrypt.hash('test1234', 4) },
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
    await prisma.zone.deleteMany({ where: { name: { in: ['lc-zone-a', 'lc-zone-b'] } } });
    await prisma.pricingPlan.deleteMany({ where: { name: 'lifecycle-test' } });
    await prisma.creditLedger.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const book = (startAt: Date, endAt: Date, extra: Record<string, unknown> = {}) =>
    auth(request(app.getHttpServer()).post('/reservations')).send({
      vehicleId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      insurance: 'LIGHT',
      useCredit: false,
      cardLast4: '4242',
      idempotencyKey: randomUUID(),
      ...extra,
    });

  it('이용 중 연장은 다음 예약과 충돌하면 409, 빈 구간이면 성공한다', async () => {
    const start = nextSlot();
    const end = addMin(start, 30);
    const mine = await book(start, end);
    expect(mine.status).toBe(201);

    // 뒤 예약: 60분 후 시작 (연장 여유 30분)
    const blocker = await book(addMin(start, 60), addMin(start, 90));
    expect(blocker.status).toBe(201);

    const started = await auth(request(app.getHttpServer()).post('/rentals/start')).send({
      reservationId: mine.body.id,
    });
    expect(started.status).toBe(201);
    const rentalId = started.body.id;

    // 뒤 예약을 침범하는 연장 → 409
    const tooFar = await auth(
      request(app.getHttpServer()).post(`/rentals/${rentalId}/extend`),
    ).send({ endAt: addMin(start, 70).toISOString(), idempotencyKey: randomUUID() });
    expect(tooFar.status).toBe(409);

    // 빈 구간 연장 → 성공 + 연장분 결제
    const ok = await auth(request(app.getHttpServer()).post(`/rentals/${rentalId}/extend`)).send({
      endAt: addMin(start, 60).toISOString(),
      idempotencyKey: randomUUID(),
    });
    expect(ok.status).toBe(201);
    const payments = ok.body.reservation.payments as { amountKrw: number }[];
    expect(payments.length).toBe(2); // 최초 결제 + 연장분

    // 정리: 반납
    const returned = await auth(
      request(app.getHttpServer()).post(`/rentals/${rentalId}/return`),
    ).send({});
    expect(returned.status).toBe(201);
    await auth(request(app.getHttpServer()).post(`/reservations/${blocker.body.id}/cancel`)).send({});
  });

  it('편도 반납을 완료하면 차량이 반납 존으로 이동한다', async () => {
    const start = nextSlot();
    const end = addMin(start, 30);
    const oneway = await book(start, end, { returnZoneId: zoneBId });
    expect(oneway.status).toBe(201);
    expect(oneway.body.onewayFeeKrw).toBeGreaterThanOrEqual(5000);

    const started = await auth(request(app.getHttpServer()).post('/rentals/start')).send({
      reservationId: oneway.body.id,
    });
    expect(started.status).toBe(201);

    const returned = await auth(
      request(app.getHttpServer()).post(`/rentals/${started.body.id}/return`),
    ).send({});
    expect(returned.status).toBe(201);
    expect(returned.body.status).toBe('COMPLETED');
    // 주행거리는 텔레메트리 모의값으로 자동 확정
    expect(returned.body.distanceKm).toBeGreaterThan(0);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.zoneId).toBe(zoneBId);

    // 다음 테스트를 위해 A존으로 복구
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { zoneId: zoneAId } });
  });

  it('예약 시간 변경 시 차액이 결제되고, 줄이면 크레딧으로 환급된다', async () => {
    const start = nextSlot(120); // 2시간 뒤
    const resv = await book(start, addMin(start, 60)); // 1시간 = 6600원
    expect(resv.status).toBe(201);
    const baseTotal = resv.body.totalUpfrontKrw;

    // 2시간으로 연장 변경 → 차액 추가 결제
    const longer = await auth(request(app.getHttpServer()).patch(`/reservations/${resv.body.id}`)).send({
      startAt: start.toISOString(),
      endAt: addMin(start, 120).toISOString(),
      idempotencyKey: randomUUID(),
    });
    expect(longer.status).toBe(200);
    expect(longer.body.totalUpfrontKrw).toBe(baseTotal * 2);
    expect((longer.body.payments as unknown[]).length).toBe(2);

    // 30분으로 축소 변경 → 크레딧 환급
    const shorter = await auth(request(app.getHttpServer()).patch(`/reservations/${resv.body.id}`)).send({
      startAt: start.toISOString(),
      endAt: addMin(start, 30).toISOString(),
      idempotencyKey: randomUUID(),
    });
    expect(shorter.status).toBe(200);

    const refund = await prisma.creditLedger.findFirst({
      where: { reservationId: resv.body.id, reason: 'REFUND' },
    });
    expect(refund).not.toBeNull();
    expect(refund!.deltaKrw).toBeGreaterThan(0);

    await auth(request(app.getHttpServer()).post(`/reservations/${resv.body.id}/cancel`)).send({});
  });
});
