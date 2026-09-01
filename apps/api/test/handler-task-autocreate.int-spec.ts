/**
 * 핸들러 작업 자동 생성(M2-2) 통합 테스트 —
 * 부름 결제 → 배달, 부름 반납 → 회수, 예약 취소 → 작업 취소, 비부름 예약은 무생성.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { DELIVERY_MIN_LEAD_MINUTES, HANDLER_RETRIEVE_DUE_MINUTES } from '@socar/shared';
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
const OTHER_POS = { lat: 37.544061, lng: 127.037627 };
const PICKUP = { lat: 37.5405, lng: 127.0505, label: '회사 정문 앞' };
const PHOTO = { mime: 'image/jpeg', data: Buffer.from('x'.repeat(30)).toString('base64') };

describe('핸들러 작업 자동 생성 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let planId: string;
  let zoneId: string;
  let otherZoneId: string;
  const vehicleIds: string[] = [];
  const email = `autocreate-${Date.now()}@test.mocar.kr`;
  const tag = `autocreate-${Date.now()}`;

  /** 테스트마다 새 차량 — 예약 시간이 겹쳐 EXCLUDE 제약에 걸리는 일을 피한다 */
  async function makeVehicle(): Promise<string> {
    const v = await prisma.vehicle.create({
      data: {
        modelName: '자동생성테스트카',
        plateNo: `${90 + vehicleIds.length}테${Date.now() % 10000}`,
        fuel: 'GASOLINE',
        seats: 5,
        zoneId,
        planId,
      },
    });
    vehicleIds.push(v.id);
    return v.id;
  }

  const book = (vehicleId: string, startAt: Date, endAt: Date, extra: Record<string, unknown> = {}) =>
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
    planId = plan.id;
    const [zone, other] = await Promise.all([
      prisma.zone.create({
        data: { name: `${tag}-a`, region: 'seoul', address: '성수', ...ZONE_POS, capacity: 3 },
      }),
      prisma.zone.create({
        data: { name: `${tag}-b`, region: 'seoul', address: '서울숲', ...OTHER_POS, capacity: 3 },
      }),
    ]);
    zoneId = zone.id;
    otherZoneId = other.id;

    await prisma.user.create({
      data: { email, name: '자동생성테스트', role: 'USER', passwordHash: await bcrypt.hash('test1234', 4) },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'test1234' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    const where = { vehicleId: { in: vehicleIds } };
    await prisma.handlerTask.deleteMany({ where });
    await prisma.conditionPhoto.deleteMany({ where: { report: { rental: { reservation: where } } } });
    await prisma.conditionReport.deleteMany({ where: { rental: { reservation: where } } });
    await prisma.payment.deleteMany({ where: { reservation: where } });
    await prisma.rental.deleteMany({ where: { reservation: where } });
    await prisma.reservation.deleteMany({ where });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.zone.deleteMany({ where: { name: { in: [`${tag}-a`, `${tag}-b`] } } });
    await prisma.pricingPlan.deleteMany({ where: { name: tag } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('부름 예약 결제 → 배달 작업이 같은 트랜잭션에서 생성된다 (기한 = 시작 − 60분)', async () => {
    const vehicleId = await makeVehicle();
    const start = nextSlot(90);
    const res = await book(vehicleId, start, addMin(start, 60), { delivery: PICKUP });
    expect(res.status).toBe(201);

    const tasks = await prisma.handlerTask.findMany({ where: { reservationId: res.body.id } });
    expect(tasks).toHaveLength(1);
    const [task] = tasks;
    expect(task.type).toBe('DELIVERY');
    // 태어날 때는 미배정 공개 작업이다 — 핸들러 수락(M2-3)이나 운영자 배정(M2-4)을 기다린다
    expect(task.status).toBe('PENDING');
    expect(task.assigneeId).toBeNull();
    expect(task.vehicleId).toBe(vehicleId);
    expect(task.fromZoneId).toBe(zoneId); // 출발 = 시작 시각의 유효 존
    expect(task.toZoneId).toBeNull(); // 도착은 존이 아니라 수령지 좌표
    expect(task.toLat).toBeCloseTo(PICKUP.lat, 5);
    expect(task.toLng).toBeCloseTo(PICKUP.lng, 5);
    expect(task.toLabel).toBe(PICKUP.label);
    expect(task.dueAt.getTime()).toBe(start.getTime() - DELIVERY_MIN_LEAD_MINUTES * 60 * 1000);
  });

  it('부름 이용 반납(정산 완료) → 회수 작업이 생성된다 (수령지 → 원래 존)', async () => {
    const vehicleId = await makeVehicle();
    const start = nextSlot(90);
    const res = await book(vehicleId, start, addMin(start, 60), { delivery: PICKUP });
    expect(res.status).toBe(201);

    // 부름은 리드타임 때문에 최소 60분 뒤로만 예약된다 — 이용을 시작할 수 있게 시각만 당긴다
    const now = new Date();
    await prisma.reservation.update({
      where: { id: res.body.id },
      data: { startAt: addMin(now, -5), endAt: addMin(now, 55) },
    });

    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const started = await auth(
      request(app.getHttpServer()).post('/rentals/start').send({ reservationId: res.body.id }),
    ).expect(201);
    const rentalId = started.body.id;

    await auth(
      request(app.getHttpServer()).post(`/rentals/${rentalId}/check-in`).send({ photos: [PHOTO] }),
    ).expect(201);
    await auth(
      request(app.getHttpServer())
        .post(`/rentals/${rentalId}/check-out`)
        .send({ parkingNote: '정문 앞 노상', photos: [PHOTO] }),
    ).expect(201);
    await auth(request(app.getHttpServer()).post(`/rentals/${rentalId}/return`)).expect(201);

    const tasks = await prisma.handlerTask.findMany({
      where: { reservationId: res.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(tasks.map((t) => t.type)).toEqual(['DELIVERY', 'RETRIEVE']);

    const retrieve = tasks[1];
    expect(retrieve.status).toBe('PENDING');
    expect(retrieve.fromLat).toBeCloseTo(PICKUP.lat, 5); // 이용자가 세워 둔 수령지에서 출발
    expect(retrieve.fromLabel).toBe(PICKUP.label);
    expect(retrieve.toZoneId).toBe(zoneId); // 제자리 회수 — 배달이 출발했던 존으로
    expect(retrieve.fromZoneId).toBe(zoneId);
    // 기한은 반납 시각 + 회수 여유 시간
    const expectedDue = Date.now() + HANDLER_RETRIEVE_DUE_MINUTES * 60 * 1000;
    expect(Math.abs(retrieve.dueAt.getTime() - expectedDue)).toBeLessThan(60_000);

    // 회수 전까지 차량은 아직 원래 존 소속이다 (실제 위치 갱신은 작업 완료 시점 — M2-3)
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.zoneId).toBe(zoneId);
  });

  it('예약 취소 → 대기/배정 작업만 취소되고 이동 중 작업은 남는다', async () => {
    const vehicleId = await makeVehicle();
    const start = nextSlot(120);
    const res = await book(vehicleId, start, addMin(start, 60), { delivery: PICKUP });
    expect(res.status).toBe(201);
    const reservationId = res.body.id;

    // 배달은 이미 핸들러에게 배정된 상태로, 별도 작업 하나는 이동 중으로 둔다
    const delivery = await prisma.handlerTask.findFirstOrThrow({ where: { reservationId } });
    const handler = await prisma.user.create({
      data: { email: `${tag}-h@test.mocar.kr`, name: '취소테스트핸들러', role: 'HANDLER', passwordHash: 'x' },
    });
    await prisma.handlerTask.update({
      where: { id: delivery.id },
      data: { status: 'ASSIGNED', assigneeId: handler.id, assignedAt: new Date() },
    });
    const enRoute = await prisma.handlerTask.create({
      data: {
        type: 'RETRIEVE', status: 'EN_ROUTE', reservationId, vehicleId,
        fromZoneId: zoneId, toZoneId: zoneId,
        assigneeId: handler.id, assignedAt: new Date(), startedAt: new Date(),
        dueAt: addMin(new Date(), 60),
      },
    });

    await request(app.getHttpServer())
      .post(`/reservations/${reservationId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const after = await prisma.handlerTask.findMany({ where: { reservationId } });
    const canceled = after.find((t) => t.id === delivery.id);
    expect(canceled?.status).toBe('CANCELED');
    expect(canceled?.canceledAt).not.toBeNull();
    expect(canceled?.cancelReason).toBe('예약 취소');
    // 차를 옮기는 중인 작업은 그대로 — 완료로 닫아야 차량 위치의 책임자가 남는다
    expect(after.find((t) => t.id === enRoute.id)?.status).toBe('EN_ROUTE');

    await prisma.handlerTask.deleteMany({ where: { reservationId } });
    await prisma.user.delete({ where: { id: handler.id } });
  });

  it('왕복·편도 예약에는 핸들러 작업이 생기지 않는다', async () => {
    const roundTripVehicle = await makeVehicle();
    const start = nextSlot(90);
    const round = await book(roundTripVehicle, start, addMin(start, 60));
    expect(round.status).toBe(201);

    const onewayVehicle = await makeVehicle();
    const oneway = await book(onewayVehicle, start, addMin(start, 60), { returnZoneId: otherZoneId });
    expect(oneway.status).toBe(201);
    expect(oneway.body.returnZoneId).toBe(otherZoneId);

    const tasks = await prisma.handlerTask.findMany({
      where: { reservationId: { in: [round.body.id, oneway.body.id] } },
    });
    expect(tasks).toHaveLength(0);
  });
});
