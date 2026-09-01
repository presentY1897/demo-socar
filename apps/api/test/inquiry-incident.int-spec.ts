/**
 * 문의 + 사고 접수(M1-7) 통합 테스트.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { INSURANCE_META, PHOTO_MIME } from '@socar/shared';
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
const photo = () => ({ mime: PHOTO_MIME, data: Buffer.alloc(500, 2).toString('base64') });

describe('문의 · 사고 접수 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let otherToken: string;
  let vehicleId: string;
  let rentalId: string;
  const tag = `inquiry-${Date.now()}`;
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
        modelName: '테스트카IQ', plateNo: `94테${Date.now() % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zone.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;

    const passwordHash = await bcrypt.hash('test1234', 4);
    await prisma.user.create({ data: { email, name: '문의', role: 'USER', passwordHash } });
    await prisma.user.create({ data: { email: otherEmail, name: '남', role: 'USER', passwordHash } });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'test1234' })).body.accessToken;
    otherToken = (await request(app.getHttpServer()).post('/auth/login').send({ email: otherEmail, password: 'test1234' })).body.accessToken;

    // 완전보장(FULL)으로 예약해 두면 자기부담금 0원 안내를 검증할 수 있다
    const start = nextSlot();
    const resv = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vehicleId,
        startAt: start.toISOString(),
        endAt: addMin(start, 30).toISOString(),
        insurance: 'FULL',
        useCredit: false,
        cardLast4: '4242',
        idempotencyKey: randomUUID(),
      });
    expect(resv.status).toBe(201);
    const started = await request(app.getHttpServer())
      .post('/rentals/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ reservationId: resv.body.id });
    expect(started.status).toBe(201);
    rentalId = started.body.id;
  });

  afterAll(async () => {
    await prisma.incidentPhoto.deleteMany({ where: { incident: { rental: { reservation: { vehicleId } } } } });
    await prisma.incidentReport.deleteMany({ where: { rental: { reservation: { vehicleId } } } });
    await prisma.inquiry.deleteMany({ where: { user: { email: { in: [email, otherEmail] } } } });
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

  it('문의를 접수하면 내 문의함에 OPEN 상태로 쌓인다', async () => {
    const created = await post('/inquiries').send({
      category: 'VEHICLE',
      body: '블루투스 연결이 되지 않습니다',
      vehicleId,
      rentalId,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'OPEN', category: 'VEHICLE', answer: null });

    const mine = await get('/me/inquiries');
    expect(mine.status).toBe(200);
    expect(mine.body[0]).toMatchObject({ id: created.body.id, status: 'OPEN' });

    // 남의 문의함에는 보이지 않는다
    expect((await get('/me/inquiries', otherToken)).body).toHaveLength(0);
  });

  it('짧은 본문·없는 카테고리는 400, 남의 이용을 붙이면 403', async () => {
    expect((await post('/inquiries').send({ category: 'VEHICLE', body: '고장' })).status).toBe(400);
    expect((await post('/inquiries').send({ category: 'BATTERY', body: '충전이 안 됩니다' })).status).toBe(400);

    const stolen = await post('/inquiries', otherToken).send({
      category: 'RETURN',
      body: '반납 정산이 이상합니다',
      rentalId,
    });
    expect(stolen.status).toBe(403);
  });

  it('사고 접수 응답에 가입 면책상품과 자기부담금이 실린다', async () => {
    const received = await post(`/rentals/${rentalId}/incident`).send({
      description: '주차장에서 후진하다 뒤 범퍼가 기둥에 닿았습니다',
      photos: [photo()],
    });
    expect(received.status).toBe(201);
    expect(received.body.incident).toMatchObject({ rentalId, status: 'RECEIVED' });
    expect(received.body.incident.photos).toHaveLength(1);
    expect(received.body.incident.photos[0].dataUri).toMatch(/^data:image\/jpeg;base64,/);

    // 예약이 FULL(완전보장)이라 자기부담금 0원으로 안내된다
    expect(received.body.insurance).toEqual({
      tier: 'FULL',
      label: INSURANCE_META.FULL.label,
      deductibleKrw: 0,
      description: INSURANCE_META.FULL.description,
    });
    expect(received.body.insurer.phone).toBe('1588-0000');
    expect(received.body.insurer.steps.length).toBeGreaterThan(0);
  });

  it('사진 없이도 접수되지만 설명이 짧으면 400, 남의 대여면 403', async () => {
    const noPhoto = await post(`/rentals/${rentalId}/incident`).send({
      description: '주행 중 우측 사이드미러가 접촉으로 파손되었습니다',
    });
    expect(noPhoto.status).toBe(201);
    expect(noPhoto.body.incident.photos).toHaveLength(0);

    expect((await post(`/rentals/${rentalId}/incident`).send({ description: '쿵' })).status).toBe(400);
    expect(
      (await post(`/rentals/${rentalId}/incident`, otherToken).send({
        description: '남의 이용에 사고를 접수해 봅니다',
      })).status,
    ).toBe(403);
  });
});
