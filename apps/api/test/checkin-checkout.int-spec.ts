/**
 * 체크인/체크아웃(M1-3) 통합 테스트 — 게이트 규칙과 정상 순서 완주.
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

/** 다음 10분 경계 */
function nextSlot(offsetMinutes = 0): Date {
  const t = new Date();
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 10) * 10 + offsetMinutes);
  return t;
}
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const photo = () => ({ mime: PHOTO_MIME, data: Buffer.alloc(600, 5).toString('base64') });

describe('체크인/체크아웃 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  let vehicleId: string;
  const tag = `checkin-${Date.now()}`;
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
        modelName: '테스트카CI', plateNo: `91테${Date.now() % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zone.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;

    const passwordHash = await bcrypt.hash('test1234', 4);
    await prisma.user.create({ data: { email, name: '체크인', role: 'USER', passwordHash } });
    await prisma.user.create({ data: { email: otherEmail, name: '남', role: 'USER', passwordHash } });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'test1234' })).body.accessToken;
    otherToken = (await request(app.getHttpServer()).post('/auth/login').send({ email: otherEmail, password: 'test1234' })).body.accessToken;
  });

  afterAll(async () => {
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

  const auth = (r: request.Test, t = token) => r.set('Authorization', `Bearer ${t}`);
  const post = (path: string, t = token) => auth(request(app.getHttpServer()).post(path), t);
  const get = (path: string, t = token) => auth(request(app.getHttpServer()).get(path), t);

  /** 지금 시작하는 예약 1건을 잡고 이용을 시작한다 */
  async function startRental(durationMin = 30): Promise<string> {
    const start = nextSlot();
    const resv = await post('/reservations').send({
      vehicleId,
      startAt: start.toISOString(),
      endAt: addMin(start, durationMin).toISOString(),
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

  it('체크인 → 체크아웃 → 반납 순서를 완주한다', async () => {
    const rentalId = await startRental();

    // 시작 직후에는 두 보고 모두 비어 있다
    const before = await get(`/rentals/${rentalId}/usage`);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ rentalId, checkIn: null, checkOut: null });

    const checkIn = await post(`/rentals/${rentalId}/check-in`).send({
      notes: '앞범퍼 우측 하단 기존 흠집',
      photos: [photo(), photo()],
    });
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.phase).toBe('CHECK_IN');
    expect(checkIn.body.photos).toHaveLength(2);
    // 사진은 화면이 바로 쓰는 data: URI로 돌아온다
    expect(checkIn.body.photos[0].dataUri).toMatch(/^data:image\/jpeg;base64,/);
    expect(checkIn.body.photos[0].bytes).toBe(600);

    const checkOut = await post(`/rentals/${rentalId}/check-out`).send({
      parkingNote: '지하 2층 B-14',
      photos: [photo()],
    });
    expect(checkOut.status).toBe(201);
    expect(checkOut.body.parkingNote).toBe('지하 2층 B-14');

    const usage = await get(`/rentals/${rentalId}/usage`);
    expect(usage.body.checkIn.notes).toContain('흠집');
    expect(usage.body.checkOut.parkingNote).toBe('지하 2층 B-14');

    const returned = await post(`/rentals/${rentalId}/return`).send({});
    expect(returned.status).toBe(201);
    expect(returned.body.status).toBe('COMPLETED');
  });

  it('체크아웃 없이 반납하면 409로 막고 사유를 알려준다', async () => {
    const rentalId = await startRental();
    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);

    const returned = await post(`/rentals/${rentalId}/return`).send({});
    expect(returned.status).toBe(409);
    expect(returned.body.message).toContain('체크아웃');

    // 정리: 체크아웃 후 반납
    await post(`/rentals/${rentalId}/check-out`).send({ parkingNote: '1층 A-1', photos: [photo()] }).expect(201);
    await post(`/rentals/${rentalId}/return`).send({}).expect(201);
  });

  it('체크인 없이 체크아웃하면 409, 중복 체크인도 409', async () => {
    const rentalId = await startRental();

    const early = await post(`/rentals/${rentalId}/check-out`).send({
      parkingNote: '지상 3층',
      photos: [photo()],
    });
    expect(early.status).toBe(409);
    expect(early.body.message).toContain('체크인');

    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);
    const again = await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] });
    expect(again.status).toBe(409);

    await post(`/rentals/${rentalId}/check-out`).send({ parkingNote: '지상 3층', photos: [photo()] }).expect(201);
    const twice = await post(`/rentals/${rentalId}/check-out`).send({ parkingNote: '지상 3층', photos: [photo()] });
    expect(twice.status).toBe(409);

    await post(`/rentals/${rentalId}/return`).send({}).expect(201);
  });

  it('남의 대여에는 접근할 수 없다 (403)', async () => {
    const rentalId = await startRental();

    expect((await post(`/rentals/${rentalId}/check-in`, otherToken).send({ photos: [photo()] })).status).toBe(403);
    expect((await get(`/rentals/${rentalId}/usage`, otherToken)).status).toBe(403);

    // 정리
    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);
    await post(`/rentals/${rentalId}/check-out`).send({ parkingNote: '1층', photos: [photo()] }).expect(201);
    await post(`/rentals/${rentalId}/return`).send({}).expect(201);
  });

  it('사진 없는 체크인·주차 위치 없는 체크아웃·jpeg 아닌 사진은 400', async () => {
    const rentalId = await startRental();

    expect((await post(`/rentals/${rentalId}/check-in`).send({ photos: [] })).status).toBe(400);
    expect(
      (await post(`/rentals/${rentalId}/check-in`).send({
        photos: [{ mime: 'image/png', data: Buffer.alloc(100).toString('base64') }],
      })).status,
    ).toBe(400);

    await post(`/rentals/${rentalId}/check-in`).send({ photos: [photo()] }).expect(201);
    expect((await post(`/rentals/${rentalId}/check-out`).send({ photos: [photo()] })).status).toBe(400);
    expect(
      (await post(`/rentals/${rentalId}/check-out`).send({ parkingNote: '', photos: [photo()] })).status,
    ).toBe(400);

    await post(`/rentals/${rentalId}/check-out`).send({ parkingNote: '1층', photos: [photo()] }).expect(201);
    await post(`/rentals/${rentalId}/return`).send({}).expect(201);
  });
});
