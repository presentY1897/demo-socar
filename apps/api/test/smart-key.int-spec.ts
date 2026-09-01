/**
 * 가상 스마트키(M1-4) 통합 테스트 — 게이트(403)·정합성(400)·로그 적재.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { PHOTO_MIME } from '@socar/shared';
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
const photo = () => ({ mime: PHOTO_MIME, data: Buffer.alloc(400, 5).toString('base64') });

describe('가상 스마트키 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  let vehicleId: string;
  const tag = `smartkey-${Date.now()}`;
  const email = `${tag}@test.mocar.kr`;
  const otherEmail = `${tag}-other@test.mocar.kr`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: tag, baseHourlyKrw: 6000, weekendHourlyKrw: 6000, perKmKrw: 200,
        insuranceLightKrw: 600, insuranceStandardKrw: 1200, insuranceFullKrw: 1800,
      },
    });
    const zone = await prisma.zone.create({
      data: { name: tag, region: 'seoul', address: 'A', lat: 37.5445, lng: 127.0559, capacity: 2 },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '테스트카SK', plateNo: `92테${Date.now() % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zone.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;
    // 스마트키 상태는 텔레메트리가 갖는다 (M3-1 이관) — 차는 잠긴 채 서 있는 상태로 시작
    await prisma.vehicleTelemetry.create({
      data: {
        vehicleId, fuelPct: 68, odometerKm: 14200,
        doorLocked: true, engineOn: false, lat: zone.lat, lng: zone.lng,
      },
    });

    const passwordHash = await bcrypt.hash('test1234', 4);
    await prisma.user.create({ data: { email, name: '스마트키', role: 'USER', passwordHash } });
    await prisma.user.create({ data: { email: otherEmail, name: '남', role: 'USER', passwordHash } });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'test1234' })).body.accessToken;
    otherToken = (await request(app.getHttpServer()).post('/auth/login').send({ email: otherEmail, password: 'test1234' })).body.accessToken;
  });

  afterAll(async () => {
    await prisma.vehicleControlLog.deleteMany({ where: { vehicleId } });
    await prisma.conditionPhoto.deleteMany({ where: { report: { rental: { reservation: { vehicleId } } } } });
    await prisma.conditionReport.deleteMany({ where: { rental: { reservation: { vehicleId } } } });
    await prisma.payment.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.rental.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: tag } });
    await prisma.pricingPlan.deleteMany({ where: { name: tag } });
    await prisma.creditLedger.deleteMany({ where: { user: { email: { in: [email, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  const post = (path: string, t = token) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${t}`);
  const get = (path: string, t = token) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${t}`);
  const control = (rentalId: string, action: string, t = token) =>
    post(`/rentals/${rentalId}/control`, t).send({ action });

  async function startRental(): Promise<string> {
    const start = nextSlot();
    const resv = await post('/reservations').send({
      vehicleId,
      startAt: start.toISOString(),
      endAt: addMin(start, 30).toISOString(),
      insurance: 'LIGHT',
      useCredit: false,
      cardLast4: '4242',
      idempotencyKey: randomUUID(),
    });
    expect(resv.status).toBe(201);
    const started = await post('/rentals/start').send({ reservationId: resv.body.id });
    expect(started.status).toBe(201);
    return started.body.id;
  }

  /** 차량 센서 상태를 초기값(잠김·시동 꺼짐)으로 되돌린다 — M3-1에서 텔레메트리로 이관 */
  const resetVehicle = () =>
    prisma.vehicleTelemetry.update({
      where: { vehicleId },
      data: { doorLocked: true, engineOn: false },
    });

  const finish = async (rentalId: string) => {
    await post(`/rentals/${rentalId}/check-out`).send({ parkingNote: '1층', photos: [photo()] }).expect(201);
    await post(`/rentals/${rentalId}/return`).send({}).expect(201);
  };

  it('체크인 전에는 403으로 막는다', async () => {
    const rentalId = await startRental();

    const blocked = await control(rentalId, 'UNLOCK');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toContain('체크인');

    // 조작이 없었으니 로그도 차량 상태도 그대로다
    expect(await prisma.vehicleControlLog.count({ where: { rentalId } })).toBe(0);
    const telemetry = await prisma.vehicleTelemetry.findUniqueOrThrow({ where: { vehicleId } });
    expect(telemetry.doorLocked).toBe(true);

    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);
    await finish(rentalId);
    await resetVehicle();
  });

  it('체크인 후 문열기·시동이 로그로 남고 차량 상태가 갱신된다', async () => {
    const rentalId = await startRental();
    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);

    const unlocked = await control(rentalId, 'UNLOCK');
    expect(unlocked.status).toBe(201);
    expect(unlocked.body.state).toMatchObject({ doorLocked: false, engineOn: false, lastAction: 'UNLOCK' });

    const started = await control(rentalId, 'IGNITION_ON');
    expect(started.status).toBe(201);
    expect(started.body.state).toMatchObject({ doorLocked: false, engineOn: true });

    // 비상등은 신호일 뿐이라 상태를 바꾸지 않는다
    const hazard = await control(rentalId, 'HAZARD');
    expect(hazard.status).toBe(201);
    expect(hazard.body.state).toMatchObject({ doorLocked: false, engineOn: true });

    const logs = await prisma.vehicleControlLog.findMany({ where: { rentalId }, orderBy: { at: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['UNLOCK', 'IGNITION_ON', 'HAZARD']);

    // 이용 상태 요약에도 같은 상태가 실린다
    const usage = await get(`/rentals/${rentalId}/usage`);
    expect(usage.body.smartKey).toMatchObject({ doorLocked: false, engineOn: true, lastAction: 'HAZARD' });

    await control(rentalId, 'IGNITION_OFF').expect(201);
    await finish(rentalId);
    await resetVehicle();
  });

  it('시동이 켜진 채 잠금은 400, 문이 잠긴 채 시동도 400', async () => {
    const rentalId = await startRental();
    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);

    const earlyIgnition = await control(rentalId, 'IGNITION_ON');
    expect(earlyIgnition.status).toBe(400);
    expect(earlyIgnition.body.message).toContain('문을 먼저 열어');

    await control(rentalId, 'UNLOCK').expect(201);
    await control(rentalId, 'IGNITION_ON').expect(201);

    const lockWhileRunning = await control(rentalId, 'LOCK');
    expect(lockWhileRunning.status).toBe(400);
    expect(lockWhileRunning.body.message).toContain('시동');

    // 거절된 조작은 로그에 남지 않는다
    const logs = await prisma.vehicleControlLog.findMany({ where: { rentalId } });
    expect(logs.map((l) => l.action).sort()).toEqual(['IGNITION_ON', 'UNLOCK']);

    await control(rentalId, 'IGNITION_OFF').expect(201);
    await control(rentalId, 'LOCK').expect(201);
    await finish(rentalId);
    await resetVehicle();
  });

  it('남의 대여와 이용이 끝난 대여는 403', async () => {
    const rentalId = await startRental();
    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);

    expect((await control(rentalId, 'UNLOCK', otherToken)).status).toBe(403);

    await finish(rentalId);
    const afterReturn = await control(rentalId, 'UNLOCK');
    expect(afterReturn.status).toBe(403);
    expect(afterReturn.body.message).toContain('이용 중');
    await resetVehicle();
  });

  it('알 수 없는 action은 400', async () => {
    const rentalId = await startRental();
    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);

    expect((await control(rentalId, 'TRUNK_OPEN')).status).toBe(400);

    await finish(rentalId);
    await resetVehicle();
  });
});
