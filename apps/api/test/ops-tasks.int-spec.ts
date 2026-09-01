/**
 * 배정 API(M2-4) 통합 테스트 — /ops/tasks 목록·배정·재배치 생성·후보 추천.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { HandlerCandidateRes, HandlerQueueRes, HandlerTaskRes } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const ZONE_POS = { lat: 37.544579, lng: 127.055961 }; // 성수역 — 작업 출발지
const NEAR_POS = { lat: 37.547189, lng: 127.047478 }; // 뚝섬역 (약 0.8km)
const FAR_POS = { lat: 37.557527, lng: 126.9244669 }; // 홍대입구역 (약 11km)
const addMin = (m: number) => new Date(Date.now() + m * 60000);

describe('배정 API (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let opsToken: string;
  let nearToken: string;
  let zoneId: string;
  let nearZoneId: string;
  let farZoneId: string;
  let nearHandlerId: string;
  let farHandlerId: string;
  let planId: string;
  const vehicleIds: string[] = [];
  const tag = `ops-tasks-${Date.now()}`;
  const zoneNames = [`${tag}-origin`, `${tag}-near`, `${tag}-far`];
  const emails = [`${tag}-ops@test.mocar.kr`, `${tag}-near@test.mocar.kr`, `${tag}-far@test.mocar.kr`];

  const auth = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const asOps = (r: request.Test) => auth(opsToken)(r);

  let plateSeq = 0;
  async function makeVehicle(zone = zoneId): Promise<string> {
    const seq = plateSeq++;
    const v = await prisma.vehicle.create({
      data: {
        modelName: '배정테스트카',
        plateNo: `${10 + (seq % 80)}배${(Date.now() + seq) % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zone, planId,
      },
    });
    vehicleIds.push(v.id);
    return v.id;
  }

  async function makeTask(
    data: Partial<Parameters<PrismaService['handlerTask']['create']>[0]['data']> = {},
  ) {
    const vehicleId = await makeVehicle();
    return prisma.handlerTask.create({
      data: {
        type: 'REPOSITION', vehicleId, fromZoneId: zoneId, toZoneId: nearZoneId,
        dueAt: addMin(120), ...data,
      } as Parameters<PrismaService['handlerTask']['create']>[0]['data'],
    });
  }

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
    const [origin, near, far] = await Promise.all([
      prisma.zone.create({ data: { name: zoneNames[0], region: 'seoul', address: '성수', ...ZONE_POS, capacity: 5 } }),
      prisma.zone.create({ data: { name: zoneNames[1], region: 'seoul', address: '뚝섬', ...NEAR_POS, capacity: 5 } }),
      prisma.zone.create({ data: { name: zoneNames[2], region: 'seoul', address: '홍대', ...FAR_POS, capacity: 5 } }),
    ]);
    zoneId = origin.id;
    nearZoneId = near.id;
    farZoneId = far.id;

    const passwordHash = await bcrypt.hash('test1234', 4);
    const [, nearHandler, farHandler] = await Promise.all([
      prisma.user.create({ data: { email: emails[0], name: '운영자', role: 'OPS_ADMIN', passwordHash } }),
      prisma.user.create({ data: { email: emails[1], name: `${tag}-가까운기사`, role: 'HANDLER', passwordHash } }),
      prisma.user.create({ data: { email: emails[2], name: `${tag}-먼기사`, role: 'HANDLER', passwordHash } }),
    ]);
    nearHandlerId = nearHandler.id;
    farHandlerId = farHandler.id;

    const login = async (email: string) =>
      (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'test1234' }).expect(201))
        .body.accessToken as string;
    [opsToken, nearToken] = await Promise.all([login(emails[0]), login(emails[1])]);
  });

  afterAll(async () => {
    await prisma.handlerTask.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.zone.deleteMany({ where: { name: { in: zoneNames } } });
    await prisma.pricingPlan.deleteMany({ where: { name: tag } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('운영 어드민만 작업 목록을 볼 수 있다', async () => {
    await asOps(request(app.getHttpServer()).get('/ops/tasks')).expect(200);
    // 핸들러는 자기 큐(/handler/tasks)만 본다 — 전체 배정 화면은 운영자의 것
    await auth(nearToken)(request(app.getHttpServer()).get('/ops/tasks')).expect(403);
    await request(app.getHttpServer()).get('/ops/tasks').expect(401);
  });

  it('배정하면 그 핸들러의 큐에 바로 나타난다', async () => {
    const task = await makeTask({ dueAt: addMin(30) });

    const res = await asOps(
      request(app.getHttpServer()).post(`/ops/tasks/${task.id}/assign`).send({ handlerId: nearHandlerId }),
    ).expect(201);
    const body = res.body as HandlerTaskRes;
    expect(body.status).toBe('ASSIGNED');
    expect(body.assigneeId).toBe(nearHandlerId);
    expect(body.assigneeName).toContain('가까운기사');

    const queue = (
      await auth(nearToken)(request(app.getHttpServer()).get('/handler/tasks')).expect(200)
    ).body as HandlerQueueRes;
    // 여기서 보는 건 "내 큐에 들어왔는가"다. 오늘/예정 중 어느 칸인지는 기한이 자정을
    // 넘는지에 달려 있어(dueAt = 지금+30분) 자정 30분 전에 돌리면 예정으로 간다 —
    // 그 갈림은 handler-api.int-spec의 큐 분할 테스트가 따로 고정한다.
    expect([...queue.today, ...queue.upcoming].map((t) => t.id)).toContain(task.id);
    expect(queue.open.map((t) => t.id)).not.toContain(task.id); // 더 이상 공개 작업이 아니다
  });

  it('배정된 작업은 이동 시작 전까지 다른 핸들러로 바꿀 수 있다', async () => {
    const task = await makeTask({
      status: 'ASSIGNED', assigneeId: nearHandlerId, assignedAt: new Date(),
    });

    const res = await asOps(
      request(app.getHttpServer()).post(`/ops/tasks/${task.id}/assign`).send({ handlerId: farHandlerId }),
    ).expect(201);
    expect((res.body as HandlerTaskRes).assigneeId).toBe(farHandlerId);
  });

  it('이미 이동을 시작한 작업은 재배정할 수 없다', async () => {
    const enRoute = await makeTask({
      status: 'EN_ROUTE', assigneeId: nearHandlerId, assignedAt: new Date(), startedAt: new Date(),
    });
    await asOps(
      request(app.getHttpServer()).post(`/ops/tasks/${enRoute.id}/assign`).send({ handlerId: farHandlerId }),
    ).expect(409);

    // 핸들러가 아닌 사용자에게는 배정할 수 없다
    const pending = await makeTask();
    const ops = await prisma.user.findUniqueOrThrow({ where: { email: emails[0] } });
    await asOps(
      request(app.getHttpServer()).post(`/ops/tasks/${pending.id}/assign`).send({ handlerId: ops.id }),
    ).expect(404);
  });

  it('후보 추천: 마지막 완료 지점이 가까운 핸들러가 앞에 온다', async () => {
    // 두 핸들러가 각각 다른 존에서 작업을 끝낸 상태를 만든다
    await Promise.all([
      makeTask({
        status: 'DONE', assigneeId: nearHandlerId, toZoneId: nearZoneId,
        assignedAt: new Date(), startedAt: new Date(), completedAt: new Date(),
        completionNote: '완료', dueAt: addMin(-60),
      }),
      makeTask({
        status: 'DONE', assigneeId: farHandlerId, toZoneId: farZoneId,
        assignedAt: new Date(), startedAt: new Date(), completedAt: new Date(),
        completionNote: '완료', dueAt: addMin(-60),
      }),
    ]);
    const task = await makeTask();

    const res = await asOps(
      request(app.getHttpServer()).get(`/ops/tasks/${task.id}/candidates`),
    ).expect(200);
    const candidates = res.body as HandlerCandidateRes[];

    const mine = candidates.filter((c) => [nearHandlerId, farHandlerId].includes(c.handlerId));
    expect(mine.map((c) => c.handlerId)).toEqual([nearHandlerId, farHandlerId]);
    expect(mine[0].distanceMeters).toBeLessThan(mine[1].distanceMeters!);
    expect(mine[0].lastPlaceLabel).toBe(zoneNames[1]);
    expect(mine[0].reasons[0]).toContain(zoneNames[1]);

    // 완주 기록이 없는 핸들러(시드 계정 등)는 거리를 알 수 없어 뒤에 붙는다
    const unknownIndex = candidates.findIndex((c) => c.distanceMeters === null);
    if (unknownIndex >= 0) {
      expect(unknownIndex).toBeGreaterThan(candidates.indexOf(mine[1]));
    }
  });

  it('재배치 작업을 직접 만들 수 있다 (출발은 차량이 실제 서 있는 존)', async () => {
    const vehicleId = await makeVehicle();
    const server = app.getHttpServer();

    const res = await asOps(
      request(server).post('/ops/tasks').send({
        vehicleId, toZoneId: farZoneId, dueAt: addMin(180).toISOString(),
      }),
    ).expect(201);
    const body = res.body as HandlerTaskRes;
    expect(body.type).toBe('REPOSITION');
    expect(body.status).toBe('PENDING'); // 공개 작업으로 태어난다
    expect(body.from.zoneId).toBe(zoneId);
    expect(body.to.zoneId).toBe(farZoneId);
    expect(body.reservationId).toBeNull();

    // 차가 없는 존에서 출발하는 작업 · 같은 존 · 지난 기한은 거절
    await asOps(
      request(server).post('/ops/tasks').send({
        vehicleId, fromZoneId: farZoneId, toZoneId: nearZoneId, dueAt: addMin(180).toISOString(),
      }),
    ).expect(400);
    await asOps(
      request(server).post('/ops/tasks').send({
        vehicleId, toZoneId: zoneId, dueAt: addMin(180).toISOString(),
      }),
    ).expect(400);
    await asOps(
      request(server).post('/ops/tasks').send({
        vehicleId, toZoneId: farZoneId, dueAt: addMin(-10).toISOString(),
      }),
    ).expect(400);
  });

  it('목록은 상태·타입·기한 날짜로 좁힌다', async () => {
    const delivery = await makeTask({
      type: 'DELIVERY', toZoneId: null, toLat: NEAR_POS.lat, toLng: NEAR_POS.lng,
      toLabel: '수령지', dueAt: addMin(45),
    });
    const server = app.getHttpServer();

    const byType = (await asOps(request(server).get('/ops/tasks?type=DELIVERY')).expect(200))
      .body as HandlerTaskRes[];
    expect(byType.every((t) => t.type === 'DELIVERY')).toBe(true);
    expect(byType.map((t) => t.id)).toContain(delivery.id);

    const byStatus = (await asOps(request(server).get('/ops/tasks?status=DONE')).expect(200))
      .body as HandlerTaskRes[];
    expect(byStatus.every((t) => t.status === 'DONE')).toBe(true);
    expect(byStatus.map((t) => t.id)).not.toContain(delivery.id);

    const day = new Date(delivery.dueAt);
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const byDate = (await asOps(request(server).get(`/ops/tasks?date=${ymd}`)).expect(200))
      .body as HandlerTaskRes[];
    expect(byDate.map((t) => t.id)).toContain(delivery.id);

    await asOps(request(server).get('/ops/tasks?status=NOPE')).expect(400);
    await asOps(request(server).get('/ops/tasks?date=2026-9-1')).expect(400);
  });
});
