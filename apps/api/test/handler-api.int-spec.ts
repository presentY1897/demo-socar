/**
 * 핸들러 API(M2-3) 통합 테스트 — 작업 큐, 상태 전이 매트릭스, 완료 시 차량 반영.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { HandlerQueueRes, HandlerTaskRes } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const ZONE_POS = { lat: 37.544579, lng: 127.055961 }; // 성수역
const OTHER_POS = { lat: 37.544061, lng: 127.037627 }; // 서울숲
const PICKUP = { lat: 37.5405, lng: 127.0505, label: '회사 정문 앞' };
const PHOTO = { mime: 'image/jpeg', data: Buffer.from('x'.repeat(30)).toString('base64') };
const addMin = (m: number) => new Date(Date.now() + m * 60000);

describe('핸들러 API (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let handlerToken: string;
  let otherToken: string;
  let opsToken: string;
  let handlerId: string;
  let otherId: string;
  let zoneId: string;
  let otherZoneId: string;
  const vehicleIds: string[] = [];
  const tag = `handler-api-${Date.now()}`;
  const emails = [`${tag}-h1@test.mocar.kr`, `${tag}-h2@test.mocar.kr`, `${tag}-ops@test.mocar.kr`];

  const auth = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const asHandler = (r: request.Test) => auth(handlerToken)(r);

  let plateSeq = 0;
  async function makeVehicle(): Promise<string> {
    const seq = plateSeq++; // 병렬 생성이라 길이 대신 동기 카운터로 번호판을 뗀다
    const v = await prisma.vehicle.create({
      data: {
        modelName: '핸들러API테스트카',
        plateNo: `${10 + (seq % 80)}허${(Date.now() + seq) % 10000}`,
        fuel: 'GASOLINE',
        seats: 5,
        zoneId,
        planId,
        doorLocked: false,
        engineOn: true,
      },
    });
    vehicleIds.push(v.id);
    return v.id;
  }
  let planId: string;

  /** 테스트마다 필요한 모양의 작업을 직접 만든다 (자동 생성 경로는 M2-2에서 검증) */
  async function makeTask(data: Partial<Parameters<PrismaService['handlerTask']['create']>[0]['data']> = {}) {
    const vehicleId = await makeVehicle();
    return prisma.handlerTask.create({
      data: {
        type: 'REPOSITION',
        vehicleId,
        fromZoneId: zoneId,
        toZoneId: otherZoneId,
        dueAt: addMin(-10),
        ...data,
      } as Parameters<PrismaService['handlerTask']['create']>[0]['data'],
    });
  }

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'test1234' })
      .expect(201);
    return res.body.accessToken;
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
    const [zone, other] = await Promise.all([
      prisma.zone.create({
        data: { name: `${tag}-a`, region: 'seoul', address: '성수', ...ZONE_POS, capacity: 5 },
      }),
      prisma.zone.create({
        data: { name: `${tag}-b`, region: 'seoul', address: '서울숲', ...OTHER_POS, capacity: 5 },
      }),
    ]);
    zoneId = zone.id;
    otherZoneId = other.id;

    const passwordHash = await bcrypt.hash('test1234', 4);
    const [h1, h2] = await Promise.all([
      prisma.user.create({ data: { email: emails[0], name: '한기사', role: 'HANDLER', passwordHash } }),
      prisma.user.create({ data: { email: emails[1], name: '두기사', role: 'HANDLER', passwordHash } }),
      prisma.user.create({ data: { email: emails[2], name: '운영자', role: 'OPS_ADMIN', passwordHash } }),
    ]);
    handlerId = h1.id;
    otherId = h2.id;
    [handlerToken, otherToken, opsToken] = await Promise.all(emails.map(login));
  });

  afterAll(async () => {
    await prisma.handlerTask.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.zone.deleteMany({ where: { name: { in: [`${tag}-a`, `${tag}-b`] } } });
    await prisma.pricingPlan.deleteMany({ where: { name: tag } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('큐: 내 작업은 오늘/예정으로 나뉘고 기한 순으로, 지연은 표시된다', async () => {
    const [late, later, tomorrow] = await Promise.all([
      makeTask({ status: 'ASSIGNED', assigneeId: handlerId, assignedAt: new Date(), dueAt: addMin(-30) }),
      makeTask({ status: 'ASSIGNED', assigneeId: handlerId, assignedAt: new Date(), dueAt: addMin(-5) }),
      makeTask({ status: 'ASSIGNED', assigneeId: handlerId, assignedAt: new Date(), dueAt: addMin(48 * 60) }),
    ]);
    // 남의 배정 작업은 내 큐에 보이지 않는다
    const foreign = await makeTask({ status: 'ASSIGNED', assigneeId: otherId, assignedAt: new Date() });
    const open = await makeTask({ type: 'DELIVERY', toZoneId: null, toLat: PICKUP.lat, toLng: PICKUP.lng, toLabel: PICKUP.label, dueAt: addMin(120) });

    const res = await asHandler(request(app.getHttpServer()).get('/handler/tasks')).expect(200);
    const queue = res.body as HandlerQueueRes;

    const todayIds = queue.today.map((t) => t.id);
    expect(todayIds).toEqual([late.id, later.id]); // 기한 순
    expect(queue.today[0].overdue).toBe(true); // 기한이 지난 작업은 지연 표시
    expect(queue.upcoming.map((t) => t.id)).toEqual([tomorrow.id]);
    expect(queue.upcoming[0].overdue).toBe(false);
    expect([...todayIds, ...queue.upcoming.map((t) => t.id)]).not.toContain(foreign.id);

    const openTask = queue.open.find((t) => t.id === open.id);
    expect(openTask).toBeDefined();
    expect(openTask?.assigneeId).toBeNull();
    // 부름 배달의 도착지는 존이 아니라 수령지 좌표 — 카드가 예약을 다시 조회하지 않아도 된다
    expect(openTask?.to).toMatchObject({ zoneId: null, label: PICKUP.label });
    expect(openTask?.from.zoneId).toBe(zoneId);
    expect(openTask?.etaMinutes).toBeGreaterThan(0); // 지도·상세가 쓰는 A* 예상 이동 시간
    expect(openTask?.photos).toBeUndefined(); // 목록에는 base64 사진을 싣지 않는다
  });

  it('수락 → 이동 시작 → 완료를 완주하면 차량이 도착 존으로 옮겨진다', async () => {
    const task = await makeTask({ dueAt: addMin(90) });
    const server = app.getHttpServer();

    const accepted = await asHandler(request(server).post(`/handler/tasks/${task.id}/accept`)).expect(201);
    expect((accepted.body as HandlerTaskRes).status).toBe('ASSIGNED');
    expect((accepted.body as HandlerTaskRes).assigneeId).toBe(handlerId);

    const started = await asHandler(request(server).post(`/handler/tasks/${task.id}/start`)).expect(201);
    expect((started.body as HandlerTaskRes).status).toBe('EN_ROUTE');
    expect((started.body as HandlerTaskRes).startedAt).not.toBeNull();

    const done = await asHandler(
      request(server)
        .post(`/handler/tasks/${task.id}/complete`)
        .send({ note: '지하 2층 B-14 주차 완료', photos: [PHOTO] }),
    ).expect(201);
    const body = done.body as HandlerTaskRes;
    expect(body.status).toBe('DONE');
    expect(body.completionNote).toBe('지하 2층 B-14 주차 완료');
    expect(body.photos).toHaveLength(1); // 완료 응답에만 인계 사진이 실린다

    // 실물 반영: 차는 도착 존에 잠긴 채 서 있다
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: task.vehicleId } });
    expect(vehicle.zoneId).toBe(otherZoneId);
    expect(vehicle.doorLocked).toBe(true);
    expect(vehicle.engineOn).toBe(false);

    // 완료한 작업은 큐에서 빠지고 이력으로 넘어간다
    const queue = (await asHandler(request(server).get('/handler/tasks')).expect(200))
      .body as HandlerQueueRes;
    expect(queue.today.map((t) => t.id)).not.toContain(task.id);
    expect(queue.done.map((t) => t.id)).toContain(task.id);
  });

  it('부름 배달 완료는 차량의 소속 존을 바꾸지 않는다 (제자리 회수가 남아 있다)', async () => {
    const task = await makeTask({
      type: 'DELIVERY',
      status: 'EN_ROUTE',
      assigneeId: handlerId,
      assignedAt: new Date(),
      startedAt: new Date(),
      toZoneId: null,
      toLat: PICKUP.lat,
      toLng: PICKUP.lng,
      toLabel: PICKUP.label,
      dueAt: addMin(60),
    });

    await asHandler(
      request(app.getHttpServer())
        .post(`/handler/tasks/${task.id}/complete`)
        .send({ note: '정문 앞 주차, 키 반납 완료', photos: [PHOTO] }),
    ).expect(201);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: task.vehicleId } });
    expect(vehicle.zoneId).toBe(zoneId); // 소속 존은 그대로 — 회수가 원래 자리로 되돌린다
    expect(vehicle.doorLocked).toBe(true); // 이용자가 스마트키로 여는 상태로 인계
  });

  it('전이 규칙: 건너뛰기·역행·종착 이후 조작은 409', async () => {
    const server = app.getHttpServer();
    const pending = await makeTask({ dueAt: addMin(60) });
    // PENDING 건너뛰고 이동 시작 — 애초에 내 작업도 아니라 문이 두 겹이다
    await asHandler(request(server).post(`/handler/tasks/${pending.id}/start`)).expect(403);

    const assigned = await makeTask({
      status: 'ASSIGNED', assigneeId: handlerId, assignedAt: new Date(), dueAt: addMin(60),
    });
    // ASSIGNED → DONE 건너뛰기
    await asHandler(
      request(server)
        .post(`/handler/tasks/${assigned.id}/complete`)
        .send({ note: '아직 출발도 안 했다', photos: [PHOTO] }),
    ).expect(409);
    // 이미 배정된 작업을 다시 수락
    await asHandler(request(server).post(`/handler/tasks/${assigned.id}/accept`)).expect(409);

    const done = await makeTask({
      status: 'DONE', assigneeId: handlerId, assignedAt: new Date(),
      startedAt: new Date(), completedAt: new Date(), completionNote: '완료', dueAt: addMin(-60),
    });
    // 종착 상태에서 되돌리기
    await asHandler(request(server).post(`/handler/tasks/${done.id}/start`)).expect(409);

    const canceled = await makeTask({ status: 'CANCELED', canceledAt: new Date(), dueAt: addMin(60) });
    await asHandler(request(server).post(`/handler/tasks/${canceled.id}/accept`)).expect(409);
  });

  it('남에게 배정된 작업은 조작할 수 없다 (403)', async () => {
    const task = await makeTask({
      status: 'ASSIGNED', assigneeId: otherId, assignedAt: new Date(), dueAt: addMin(60),
    });
    const server = app.getHttpServer();

    await asHandler(request(server).post(`/handler/tasks/${task.id}/start`)).expect(403);
    await asHandler(
      request(server)
        .post(`/handler/tasks/${task.id}/complete`)
        .send({ note: '남의 작업', photos: [PHOTO] }),
    ).expect(403);

    // 주인은 정상 진행할 수 있다 — 막힌 건 사람이지 작업이 아니다
    await auth(otherToken)(request(server).post(`/handler/tasks/${task.id}/start`)).expect(201);
  });

  it('완료는 인계 사진과 메모가 없으면 400', async () => {
    const task = await makeTask({
      status: 'EN_ROUTE', assigneeId: handlerId, assignedAt: new Date(),
      startedAt: new Date(), dueAt: addMin(60),
    });
    const server = app.getHttpServer();

    await asHandler(
      request(server).post(`/handler/tasks/${task.id}/complete`).send({ note: '사진 없이', photos: [] }),
    ).expect(400);
    await asHandler(
      request(server).post(`/handler/tasks/${task.id}/complete`).send({ note: '', photos: [PHOTO] }),
    ).expect(400);

    // 검증에 걸린 요청은 차량도 작업도 건드리지 않는다
    const after = await prisma.handlerTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.status).toBe('EN_ROUTE');
  });

  it('핸들러가 아니면 작업 큐에 접근할 수 없다 (403)', async () => {
    await auth(opsToken)(request(app.getHttpServer()).get('/handler/tasks')).expect(403);
    await request(app.getHttpServer()).get('/handler/tasks').expect(401);
  });
});
