/**
 * 핸들러 도메인(M2-1) 통합 테스트 — 데모 계정 · HandlerTask 저장/조회 · 역할 격리.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { ACTIVE_HANDLER_TASK_STATUSES } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const HANDLER_EMAIL = 'handler@demo.mocar.kr';
/** 압축 사진을 대신하는 아주 작은 base64 JPEG 조각 */
const PHOTO_BASE64 = Buffer.from('mocar-handler-photo').toString('base64');

describe('핸들러 도메인 (통합) — 데모 계정·작업·역할', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let vehicleId: string;
  let fromZoneId: string;
  let toZoneId: string;
  let handlerId: string;
  let reservationId: string;
  const email = `handler-domain-${Date.now()}@test.mocar.kr`;
  const planName = `handler-plan-${Date.now()}`;
  const zoneNames = [`handler-zone-a-${Date.now()}`, `handler-zone-b-${Date.now()}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // 이 테스트는 시드 산출물(데모 계정·샘플 작업)을 검증한다 —
    // 아직 시드하지 않은 DB에서도 돌도록 여기서 한 번 채운다.
    if (!(await prisma.user.findUnique({ where: { email: HANDLER_EMAIL } }))) {
      await runSeed(prisma);
    }

    const plan = await prisma.pricingPlan.create({
      data: {
        name: planName, baseHourlyKrw: 6000, weekendHourlyKrw: 7500, perKmKrw: 200,
        insuranceLightKrw: 700, insuranceStandardKrw: 1400, insuranceFullKrw: 2200,
      },
    });
    const [zoneA, zoneB] = await Promise.all([
      prisma.zone.create({
        data: { name: zoneNames[0], region: 'seoul', address: '테스트 A', lat: 37.5445, lng: 127.0559, capacity: 2 },
      }),
      prisma.zone.create({
        data: { name: zoneNames[1], region: 'seoul', address: '테스트 B', lat: 37.5441, lng: 127.0376, capacity: 2 },
      }),
    ]);
    fromZoneId = zoneA.id;
    toZoneId = zoneB.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '테스트카HD', plateNo: `96테${Date.now() % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zoneA.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;

    const handler = await prisma.user.create({
      data: { email, name: '테스트핸들러', role: 'HANDLER', passwordHash: await bcrypt.hash('test1234', 4) },
    });
    handlerId = handler.id;

    // 부름 예약 1건 — 배달 작업이 매달릴 부모
    const startAt = new Date(Date.now() + 24 * 3600 * 1000);
    const reservation = await prisma.reservation.create({
      data: {
        userId: handler.id, vehicleId,
        startAt, endAt: new Date(startAt.getTime() + 3 * 3600 * 1000),
        status: 'CONFIRMED', insurance: 'STANDARD',
        deliveryLat: 37.5486, deliveryLng: 127.0602, deliveryLabel: '성수동 카페 앞',
        rentalFeeKrw: 18000, insuranceFeeKrw: 4200, deliveryFeeKrw: 6000, totalUpfrontKrw: 28200,
      },
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    await prisma.handlerTask.deleteMany({ where: { vehicleId } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: { in: zoneNames } } });
    await prisma.pricingPlan.deleteMany({ where: { name: planName } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('데모 핸들러 계정으로 로그인하면 HANDLER 역할이 내려온다', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: HANDLER_EMAIL, password: 'demo1234' })
      .expect(201);

    expect(login.body.user).toMatchObject({ email: HANDLER_EMAIL, role: 'HANDLER' });
    expect(login.body.accessToken).toEqual(expect.any(String));

    // 가드가 보는 토큰 payload에도 역할이 실린다
    const payload = JSON.parse(
      Buffer.from(String(login.body.accessToken).split('.')[1], 'base64').toString('utf8'),
    );
    expect(payload.role).toBe('HANDLER');
  });

  it('시드가 핸들러 샘플 작업을 남긴다 — 미배정 공개 작업과 배정 작업', async () => {
    const seeded = await prisma.handlerTask.findMany({
      where: { status: { in: [...ACTIVE_HANDLER_TASK_STATUSES] }, vehicleId: { not: vehicleId } },
    });
    expect(seeded.length).toBeGreaterThanOrEqual(2);
    expect(seeded.some((t) => t.status === 'PENDING' && t.assigneeId === null)).toBe(true);

    const handlerUser = await prisma.user.findUniqueOrThrow({ where: { email: HANDLER_EMAIL } });
    const mine = seeded.filter((t) => t.assigneeId === handlerUser.id);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    // 부름 회수 작업은 예약에서 파생된다
    expect(mine.some((t) => t.type === 'RETRIEVE' && t.reservationId !== null)).toBe(true);
  });

  it('세 가지 타입의 작업을 저장하고 기한 순으로 조회한다', async () => {
    const now = Date.now();
    const delivery = await prisma.handlerTask.create({
      data: {
        type: 'DELIVERY',
        reservationId,
        vehicleId,
        fromZoneId,
        toLat: 37.5486, toLng: 127.0602, toLabel: '성수동 카페 앞',
        dueAt: new Date(now + 2 * 3600 * 1000),
      },
    });
    // 기본값: 미배정 대기 상태로 태어난다
    expect(delivery.status).toBe('PENDING');
    expect(delivery.assigneeId).toBeNull();
    expect(delivery.toZoneId).toBeNull();

    await prisma.handlerTask.create({
      data: {
        type: 'RETRIEVE',
        status: 'ASSIGNED',
        reservationId,
        vehicleId,
        fromZoneId,
        fromLat: 37.5486, fromLng: 127.0602, fromLabel: '성수동 카페 앞',
        toZoneId: fromZoneId,
        assigneeId: handlerId,
        assignedAt: new Date(),
        dueAt: new Date(now + 3600 * 1000),
      },
    });
    await prisma.handlerTask.create({
      data: {
        type: 'REPOSITION',
        vehicleId,
        fromZoneId,
        toZoneId,
        dueAt: new Date(now + 6 * 3600 * 1000),
      },
    });

    const tasks = await prisma.handlerTask.findMany({
      where: { vehicleId },
      orderBy: { dueAt: 'asc' },
      include: { fromZone: true, toZone: true, assignee: true, reservation: true },
    });
    expect(tasks.map((t) => t.type)).toEqual(['RETRIEVE', 'DELIVERY', 'REPOSITION']);
    expect(tasks[0].assignee?.id).toBe(handlerId);
    expect(tasks[0].toZone?.id).toBe(fromZoneId); // 회수는 원래 존으로 되돌린다
    expect(tasks[0].reservation?.deliveryLabel).toBe('성수동 카페 앞');
    expect(tasks[1].toZone).toBeNull(); // 배달 목적지는 좌표
    expect(tasks[2].fromZone.id).toBe(fromZoneId);
    expect(tasks[2].reservationId).toBeNull(); // 재배치는 예약과 무관

    // 예약 쪽 역참조로도 같은 작업이 보인다 (M2-2의 취소 정리가 쓸 경로)
    const resv = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      include: { handlerTasks: true },
    });
    expect(resv.handlerTasks).toHaveLength(2);
  });

  it('수락 → 이동 → 완료를 기록하고 인계 사진은 작업과 함께 정리된다', async () => {
    const task = await prisma.handlerTask.create({
      data: {
        type: 'REPOSITION',
        vehicleId,
        fromZoneId,
        toZoneId,
        dueAt: new Date(Date.now() + 4 * 3600 * 1000),
      },
    });

    const assigned = await prisma.handlerTask.update({
      where: { id: task.id },
      data: { status: 'ASSIGNED', assigneeId: handlerId, assignedAt: new Date() },
    });
    expect(assigned.assigneeId).toBe(handlerId);

    await prisma.handlerTask.update({
      where: { id: task.id },
      data: { status: 'EN_ROUTE', startedAt: new Date() },
    });

    const done = await prisma.handlerTask.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        completionNote: '지하 2층 B-14에 주차 완료',
        photos: { create: [{ mime: 'image/jpeg', data: PHOTO_BASE64, bytes: 180_000 }] },
      },
      include: { photos: true },
    });
    expect(done.status).toBe('DONE');
    expect(done.startedAt).not.toBeNull();
    expect(done.photos).toHaveLength(1);
    expect(done.photos[0].data).toBe(PHOTO_BASE64);

    await prisma.handlerTask.delete({ where: { id: task.id } });
    expect(await prisma.handlerTaskPhoto.count({ where: { taskId: task.id } })).toBe(0);
  });

  it('HANDLER 역할은 운영 지표 같은 기존 보호 엔드포인트에 접근할 수 없다', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: HANDLER_EMAIL, password: 'demo1234' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/metrics/summary')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);

    // 운영 어드민은 그대로 통과한다 — 막힌 건 역할이지 엔드포인트가 아니다
    const ops = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ops@demo.mocar.kr', password: 'demo1234' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/metrics/summary')
      .set('Authorization', `Bearer ${ops.body.accessToken}`)
      .expect(200);
  });
});
