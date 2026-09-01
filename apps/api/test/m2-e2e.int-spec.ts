/**
 * M2 전 구간 E2E 통합 테스트 — 부름 예약 한 건이 **사람의 작업 두 건**으로 이어지는 전 과정.
 *
 * 개별 기능의 경계 조건은 각 스펙(`handler-task-autocreate` · `handler-api` · `ops-tasks` ·
 * `bureum`)이 덮는다. 이 스펙이 보는 것은 **그 기능들이 이어 붙었을 때 한 대의 차가
 * 존을 떠났다가 실제로 제자리로 돌아오는가** — 예약(결제)·이용(체크인~반납)·핸들러 작업이
 * 각각 다른 액터·다른 트랜잭션에서 일어나기 때문에, 사이가 벌어지면 차량의 실제 위치를
 * 아무도 책임지지 않게 된다.
 *
 *   부름 예약 결제 → [자동] DELIVERY 생성(기한 = 시작 − 60분)
 *   → 운영자 후보 조회 → 배정 → 핸들러 이동 시작 → 완료(사진 + 메모)
 *   → 이용자 이용 시작 → 체크인 → 스마트키 → 체크아웃 → 반납·정산
 *   → [자동] RETRIEVE 생성 → 핸들러 수락 → 이동 → 완료 → **차량이 원래 존으로 복귀**
 *
 * 게이트 위반도 같은 동선 위에서 확인한다 — 별도 스위트로 떼면 "이 흐름에서" 막히는지가
 * 안 보인다: 남의 작업 조작 403(전이가 성립해도 소유가 먼저) · 잘못된 전이 409 ·
 * 인계 증빙 누락 400 · 이동 중 재배정 409 · 운영 화면 접근 403.
 *
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용
 *   pnpm db:up && pnpm --filter @socar/api db:deploy && pnpm --filter @socar/api test:int
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  DELIVERY_MIN_LEAD_MINUTES,
  HANDLER_RETRIEVE_DUE_MINUTES,
  PHOTO_MIME,
  type HandlerCandidateRes,
  type HandlerQueueRes,
  type HandlerTaskRes,
} from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

/** 성수역 — 차량이 소속된 존(seoul 도로망 그래프 커버 영역) */
const HOME_POS = { lat: 37.544579, lng: 127.055961 };
/** 서울숲 — 배정 후보의 "먼 쪽" 이력을 만드는 존 */
const AWAY_POS = { lat: 37.544061, lng: 127.037627 };
/** 부름 수령지 — 존이 아니라 이용자가 찍은 좌표다 */
const PICKUP = { lat: 37.5405, lng: 127.0505, label: '회사 정문 앞' };

const SLOT_MS = 10 * 60 * 1000;
/** 지금 이후의 가장 가까운 10분 경계 + offset (예약 슬롯 정렬) */
const slot = (offsetMin = 0) =>
  new Date(Math.floor(Date.now() / SLOT_MS) * SLOT_MS + SLOT_MS + offsetMin * 60_000);
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const photo = () => ({ mime: PHOTO_MIME, data: Buffer.alloc(900, 7).toString('base64') });

describe('M2 부름 전 과정 E2E (통합) — 예약 한 건이 사람의 작업 두 건으로 이어진다', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const tag = `m2-e2e-${stamp}`;
  const emails = {
    user: `${tag}-user@test.mocar.kr`,
    handler: `${tag}-h1@test.mocar.kr`,
    other: `${tag}-h2@test.mocar.kr`,
    ops: `${tag}-ops@test.mocar.kr`,
  };
  const token: Record<keyof typeof emails, string> = {} as Record<keyof typeof emails, string>;

  let homeZoneId: string;
  let awayZoneId: string;
  let vehicleId: string;
  let handlerId: string;
  let otherHandlerId: string;
  const vehicleIds: string[] = [];

  // 단계 사이로 넘기는 상태 — 아래 it 들은 순서대로 한 동선을 이어 간다
  let reservationId: string;
  let deliveryTaskId: string;
  let retrieveTaskId: string;
  let rentalId: string;
  let deliveryFeeKrw = 0;

  const as = (who: keyof typeof emails) => (r: request.Test) =>
    r.set('Authorization', `Bearer ${token[who]}`);
  const post = (who: keyof typeof emails, path: string) =>
    as(who)(request(app.getHttpServer()).post(path));
  const get = (who: keyof typeof emails, path: string) =>
    as(who)(request(app.getHttpServer()).get(path));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: tag,
        baseHourlyKrw: 6000,
        weekendHourlyKrw: 6000,
        perKmKrw: 200,
        insuranceLightKrw: 600,
        insuranceStandardKrw: 1200,
        insuranceFullKrw: 1800,
      },
    });
    const [home, away] = await Promise.all([
      prisma.zone.create({
        data: { name: `${tag}-home`, region: 'seoul', address: '성수', ...HOME_POS, capacity: 4 },
      }),
      prisma.zone.create({
        data: { name: `${tag}-away`, region: 'seoul', address: '서울숲', ...AWAY_POS, capacity: 4 },
      }),
    ]);
    homeZoneId = home.id;
    awayZoneId = away.id;

    const makeVehicle = async (modelName: string, seq: number) => {
      const v = await prisma.vehicle.create({
        data: {
          modelName,
          plateNo: `${60 + seq}주${(stamp + seq) % 10000}`,
          fuel: 'GASOLINE',
          seats: 5,
          zoneId: home.id,
          planId: plan.id,
        },
      });
      vehicleIds.push(v.id);
      return v.id;
    };
    vehicleId = await makeVehicle('아반떼', 0);
    const historyVehicleId = await makeVehicle('이력용경차', 1);

    // 계정은 이메일로 되찾는다 — 생성 배열의 순서에 기대면 계정 하나만 늘어도 조용히 어긋난다
    const passwordHash = await bcrypt.hash('test1234', 4);
    const makeUser = (email: string, name: string, role: 'USER' | 'HANDLER' | 'OPS_ADMIN') =>
      prisma.user.create({ data: { email, name, role, passwordHash } });
    const created = await Promise.all([
      makeUser(emails.user, 'E2E 이용자', 'USER'),
      makeUser(emails.handler, `${tag}-가까운기사`, 'HANDLER'),
      makeUser(emails.other, `${tag}-다른기사`, 'HANDLER'),
      makeUser(emails.ops, 'E2E 운영자', 'OPS_ADMIN'),
    ]);
    const idByEmail = new Map(created.map((u) => [u.email, u.id]));
    handlerId = idByEmail.get(emails.handler)!;
    otherHandlerId = idByEmail.get(emails.other)!;

    // 배정 후보의 근거가 생기도록 "마지막 완료 지점"을 하나 심어 둔다 (③에서 본다)
    await prisma.handlerTask.create({
      data: {
        type: 'REPOSITION',
        status: 'DONE',
        vehicleId: historyVehicleId,
        fromZoneId: awayZoneId,
        toZoneId: homeZoneId,
        assigneeId: handlerId,
        assignedAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        completionNote: '이전 재배치 완료',
        dueAt: addMin(new Date(), -60),
      },
    });

    const login = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'test1234' })
          .expect(201)
      ).body.accessToken as string;
    for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
      token[key] = await login(emails[key]);
    }
  });

  afterAll(async () => {
    const where = { vehicleId: { in: vehicleIds } };
    await prisma.handlerTask.deleteMany({ where });
    await prisma.vehicleControlLog.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.conditionPhoto.deleteMany({
      where: { report: { rental: { reservation: where } } },
    });
    await prisma.conditionReport.deleteMany({ where: { rental: { reservation: where } } });
    await prisma.payment.deleteMany({ where: { reservation: where } });
    await prisma.rental.deleteMany({ where: { reservation: where } });
    await prisma.reservation.deleteMany({ where });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.zone.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.pricingPlan.deleteMany({ where: { name: tag } });
    await prisma.creditLedger.deleteMany({ where: { user: { email: emails.user } } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await app.close();
  });

  const zoneOf = async () =>
    (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).zoneId;

  // ═══════════════════════════════════════════════════════════
  // 1. 예약이 작업을 낳는다
  // ═══════════════════════════════════════════════════════════

  it('① 부름 예약을 결제하면 배달 작업이 같은 트랜잭션에서 태어난다 (기한 = 시작 − 60분)', async () => {
    const startAt = slot(90); // 최소 리드타임(60분) 충족
    const res = await post('user', '/reservations').send({
      vehicleId,
      startAt: startAt.toISOString(),
      endAt: addMin(startAt, 60).toISOString(),
      insurance: 'LIGHT',
      useCredit: false,
      cardLast4: '4242',
      idempotencyKey: randomUUID(),
      delivery: PICKUP,
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.deliveryLabel).toBe(PICKUP.label);
    deliveryFeeKrw = res.body.deliveryFeeKrw;
    expect(deliveryFeeKrw).toBeGreaterThan(0); // 부름 요금은 선결제에 포함된다
    reservationId = res.body.id;

    // 결제가 끝났는데 작업이 없으면 아무도 차를 옮기지 않는다 — 그래서 같은 트랜잭션이다
    const tasks = await prisma.handlerTask.findMany({ where: { reservationId } });
    expect(tasks).toHaveLength(1);
    const [delivery] = tasks;
    deliveryTaskId = delivery.id;

    expect(delivery.type).toBe('DELIVERY');
    expect(delivery.status).toBe('PENDING'); // 미배정 공개 작업으로 태어난다
    expect(delivery.assigneeId).toBeNull();
    expect(delivery.fromZoneId).toBe(homeZoneId); // 출발 = 시작 시각의 유효 존 (ADR-005)
    expect(delivery.toZoneId).toBeNull(); // 도착은 존이 아니라 수령지 좌표
    expect(delivery.toLabel).toBe(PICKUP.label);
    expect(delivery.dueAt.getTime()).toBe(
      startAt.getTime() - DELIVERY_MIN_LEAD_MINUTES * 60 * 1000,
    );

    // 아직 아무도 움직이지 않았다 — 차는 원래 존에 있다
    expect(await zoneOf()).toBe(homeZoneId);
  });

  it('② [게이트] 배정 화면은 운영자의 것 — 핸들러·이용자는 /ops/tasks에 403', async () => {
    await get('handler', '/ops/tasks').expect(403);
    await get('user', '/ops/tasks').expect(403);
    await request(app.getHttpServer()).get('/ops/tasks').expect(401);

    // 반대편도 마찬가지 — 운영자는 남의 작업 큐를 대신 처리하지 않는다
    await get('ops', '/handler/tasks').expect(403);
  });

  // ═══════════════════════════════════════════════════════════
  // 2. 운영자가 사람을 붙인다 — 점수가 아니라 근거를 보고
  // ═══════════════════════════════════════════════════════════

  it('③ 운영자는 후보의 "근거"를 보고 배정한다 (점수가 아니다)', async () => {
    const res = await get('ops', `/ops/tasks/${deliveryTaskId}/candidates`).expect(200);
    const candidates = res.body as HandlerCandidateRes[];

    const mine = candidates.filter((c) => [handlerId, otherHandlerId].includes(c.handlerId));
    expect(mine).toHaveLength(2);
    // 마지막 완료 지점을 아는 핸들러가 앞, 모르는 핸들러는 뒤
    expect(mine.map((c) => c.handlerId)).toEqual([handlerId, otherHandlerId]);
    expect(mine[0].distanceMeters).not.toBeNull();
    expect(mine[1].distanceMeters).toBeNull();

    // 화면에 나가는 건 순위 점수가 아니라 사람이 읽고 판단할 문장이다 (ADR-003 대비)
    expect(mine[0]).not.toHaveProperty('score');
    expect(mine[0].reasons[0]).toContain(`${tag}-home`); // 마지막 완료 지점
    expect(mine[0].reasons).toContain('진행 중인 작업 없음');
    expect(mine[1].reasons[0]).toContain('위치를 알 수 없');

    const assigned = await post('ops', `/ops/tasks/${deliveryTaskId}/assign`)
      .send({ handlerId })
      .expect(201);
    const body = assigned.body as HandlerTaskRes;
    expect(body.status).toBe('ASSIGNED');
    expect(body.assigneeId).toBe(handlerId);

    // 배정하는 순간 그 핸들러의 큐에 들어가고, 공개 작업 목록에서는 빠진다
    const queue = (await get('handler', '/handler/tasks').expect(200)).body as HandlerQueueRes;
    const inQueue = [...queue.today, ...queue.upcoming].find((t) => t.id === deliveryTaskId);
    expect(inQueue).toBeDefined();
    expect(inQueue?.to).toMatchObject({ zoneId: null, label: PICKUP.label });
    expect(inQueue?.etaMinutes).toBeGreaterThan(0); // 도로망 A* 예상 이동 시간
    expect(queue.open.map((t) => t.id)).not.toContain(deliveryTaskId);
  });

  it('④ [게이트] 남의 작업은 조작할 수 없다 — 전이가 성립해도 소유 검사가 먼저다', async () => {
    // 다른 핸들러의 큐에는 애초에 보이지도 않는다
    const queue = (await get('other', '/handler/tasks').expect(200)).body as HandlerQueueRes;
    expect([...queue.today, ...queue.upcoming, ...queue.open].map((t) => t.id)).not.toContain(
      deliveryTaskId,
    );

    // ASSIGNED → EN_ROUTE는 전이표가 허용하는 전이지만, 주인이 아니라 403
    await post('other', `/handler/tasks/${deliveryTaskId}/start`).expect(403);
    // ASSIGNED → DONE은 전이 위반이기도 하다 — 그래도 409가 아니라 403이 먼저 나온다
    await post('other', `/handler/tasks/${deliveryTaskId}/complete`)
      .send({ note: '남의 작업', photos: [photo()] })
      .expect(403);

    const after = await prisma.handlerTask.findUniqueOrThrow({ where: { id: deliveryTaskId } });
    expect(after.status).toBe('ASSIGNED');
    expect(after.assigneeId).toBe(handlerId);
  });

  it('⑤ [게이트] 이동도 시작하지 않았는데 완료는 409 (건너뛴 전이)', async () => {
    await post('handler', `/handler/tasks/${deliveryTaskId}/complete`)
      .send({ note: '아직 출발도 안 했다', photos: [photo()] })
      .expect(409);
    // 이미 배정된 작업을 다시 수락하는 것도 같은 이유로 409
    await post('handler', `/handler/tasks/${deliveryTaskId}/accept`).expect(409);

    const after = await prisma.handlerTask.findUniqueOrThrow({ where: { id: deliveryTaskId } });
    expect(after.status).toBe('ASSIGNED');
    expect(after.startedAt).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════
  // 3. 핸들러가 차를 옮긴다
  // ═══════════════════════════════════════════════════════════

  it('⑥ 핸들러가 이동을 시작하면 더 이상 담당자를 바꿀 수 없다', async () => {
    const started = await post('handler', `/handler/tasks/${deliveryTaskId}/start`).expect(201);
    expect((started.body as HandlerTaskRes).status).toBe('EN_ROUTE');
    expect((started.body as HandlerTaskRes).startedAt).not.toBeNull();

    // 도로 위에 있는 작업의 담당자를 바꾸면 차량의 실제 위치를 아무도 책임지지 않는다
    await post('ops', `/ops/tasks/${deliveryTaskId}/assign`)
      .send({ handlerId: otherHandlerId })
      .expect(409);

    // 거절된 재배정은 흔적을 남기지 않는다 — 담당자도 상태도 그대로다
    const after = await prisma.handlerTask.findUniqueOrThrow({ where: { id: deliveryTaskId } });
    expect(after.status).toBe('EN_ROUTE');
    expect(after.assigneeId).toBe(handlerId);
  });

  it('⑦ [게이트] 완료는 인계 사진과 메모가 없으면 400 — 작업도 차량도 그대로다', async () => {
    await post('handler', `/handler/tasks/${deliveryTaskId}/complete`)
      .send({ note: '사진 없이', photos: [] })
      .expect(400);
    await post('handler', `/handler/tasks/${deliveryTaskId}/complete`)
      .send({ note: '', photos: [photo()] })
      .expect(400);

    const after = await prisma.handlerTask.findUniqueOrThrow({ where: { id: deliveryTaskId } });
    expect(after.status).toBe('EN_ROUTE');
    expect(after.completedAt).toBeNull();
  });

  it('⑧ 배달을 완료하면 차는 잠긴 채 수령지에 인계되고, 소속 존은 그대로다', async () => {
    const res = await post('handler', `/handler/tasks/${deliveryTaskId}/complete`)
      .send({ note: '정문 앞 노상 주차, 스마트키로 열 수 있게 잠금', photos: [photo()] })
      .expect(201);
    const body = res.body as HandlerTaskRes;
    expect(body.status).toBe('DONE');
    expect(body.photos).toHaveLength(1); // 인계 증빙은 완료 응답에만 실린다

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.doorLocked).toBe(true); // 이용자가 스마트키로 여는 상태로 인계
    expect(vehicle.engineOn).toBe(false);
    // 제자리 회수(ADR-006)라 배달 시점에 존을 옮기면 위치 체인(ADR-005)이 실제와 어긋난다
    expect(vehicle.zoneId).toBe(homeZoneId);

    const queue = (await get('handler', '/handler/tasks').expect(200)).body as HandlerQueueRes;
    expect(queue.today.map((t) => t.id)).not.toContain(deliveryTaskId);
    expect(queue.done.map((t) => t.id)).toContain(deliveryTaskId);
  });

  // ═══════════════════════════════════════════════════════════
  // 4. 이용자가 배달된 차를 쓴다
  // ═══════════════════════════════════════════════════════════

  it('⑨ 이용자가 배달된 차로 이용을 시작한다 — 체크인해야 스마트키가 열린다', async () => {
    // 부름은 리드타임 때문에 최소 60분 뒤로만 잡힌다. 배달이 끝난 지금 이용을 시작할 수
    // 있도록 약속된 시각만 앞으로 당긴다 (이 스펙이 보려는 건 리드타임이 아니다)
    const now = new Date();
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { startAt: addMin(now, -5), endAt: addMin(now, 55) },
    });

    const started = await post('user', '/rentals/start').send({ reservationId }).expect(201);
    expect(started.body.status).toBe('IN_USE');
    rentalId = started.body.id;

    // 체크인 전 스마트키는 403 (ADR-007) — 배달로 받은 차라고 예외가 아니다
    await post('user', `/rentals/${rentalId}/control`).send({ action: 'UNLOCK' }).expect(403);

    await post('user', `/rentals/${rentalId}/check-in`)
      .send({ notes: '수령지 인계 상태 확인', photos: [photo()] })
      .expect(201);

    const unlocked = await post('user', `/rentals/${rentalId}/control`)
      .send({ action: 'UNLOCK' })
      .expect(201);
    expect(unlocked.body.state).toMatchObject({ doorLocked: false, engineOn: false });
    await post('user', `/rentals/${rentalId}/control`).send({ action: 'IGNITION_ON' }).expect(201);
    await post('user', `/rentals/${rentalId}/control`).send({ action: 'IGNITION_OFF' }).expect(201);
    await post('user', `/rentals/${rentalId}/control`).send({ action: 'LOCK' }).expect(201);
  });

  it('⑩ 체크아웃 → 반납·정산이 끝나면 회수 작업이 같은 트랜잭션에서 태어난다', async () => {
    // 체크아웃 전 반납은 409 (ADR-007) — 다음 사람(여기서는 핸들러)이 차를 찾을 단서가 없다
    await post('user', `/rentals/${rentalId}/return`).send({}).expect(409);

    await post('user', `/rentals/${rentalId}/check-out`)
      .send({ parkingNote: '회사 정문 앞 노상 3번 칸', photos: [photo()] })
      .expect(201);

    const returned = await post('user', `/rentals/${rentalId}/return`).send({}).expect(201);
    expect(returned.body.status).toBe('COMPLETED');
    expect(returned.body.reservation.status).toBe('COMPLETED');

    const tasks = await prisma.handlerTask.findMany({
      where: { reservationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(tasks.map((t) => t.type)).toEqual(['DELIVERY', 'RETRIEVE']);
    const retrieve = tasks[1];
    retrieveTaskId = retrieve.id;

    expect(retrieve.status).toBe('PENDING'); // 다시 미배정 공개 작업
    expect(retrieve.assigneeId).toBeNull();
    // 출발은 이용자가 세워 둔 수령지(좌표), 도착은 배달이 출발했던 존 — 제자리 회수
    expect(retrieve.fromLat).toBeCloseTo(PICKUP.lat, 5);
    expect(retrieve.fromLabel).toBe(PICKUP.label);
    expect(retrieve.toZoneId).toBe(homeZoneId);
    // 회수 기한은 앞에서 기다리는 사람이 없어 "반납 시각 + 여유"로 잡는다
    const expectedDue = Date.now() + HANDLER_RETRIEVE_DUE_MINUTES * 60 * 1000;
    expect(Math.abs(retrieve.dueAt.getTime() - expectedDue)).toBeLessThan(60_000);

    // 차는 아직 수령지에 있다 — 존 갱신은 회수 완료 시점이다
    expect(await zoneOf()).toBe(homeZoneId);
  });

  // ═══════════════════════════════════════════════════════════
  // 5. 차가 제자리로 돌아온다
  // ═══════════════════════════════════════════════════════════

  it('⑪ 핸들러가 공개 작업으로 뜬 회수를 직접 수락한다 (운영자를 거치지 않는 문)', async () => {
    const queue = (await get('handler', '/handler/tasks').expect(200)).body as HandlerQueueRes;
    const open = queue.open.find((t) => t.id === retrieveTaskId);
    expect(open).toBeDefined();
    expect(open?.type).toBe('RETRIEVE');
    expect(open?.from).toMatchObject({ zoneId: null, label: PICKUP.label }); // 수령지에서 출발
    expect(open?.to.zoneId).toBe(homeZoneId);

    const accepted = await post('handler', `/handler/tasks/${retrieveTaskId}/accept`).expect(201);
    expect((accepted.body as HandlerTaskRes).status).toBe('ASSIGNED');
    expect((accepted.body as HandlerTaskRes).assigneeId).toBe(handlerId);

    // 늦게 온 다른 핸들러는 409 — 같은 작업을 둘이 맡을 수 없다
    await post('other', `/handler/tasks/${retrieveTaskId}/accept`).expect(409);

    await post('handler', `/handler/tasks/${retrieveTaskId}/start`).expect(201);
  });

  it('⑫ 회수를 완료하면 차량이 원래 존으로 돌아와 다시 검색에 잡힌다', async () => {
    const res = await post('handler', `/handler/tasks/${retrieveTaskId}/complete`)
      .send({ note: '성수 존 B-2 반납 완료', photos: [photo()] })
      .expect(201);
    expect((res.body as HandlerTaskRes).status).toBe('DONE');

    // 실물 반영: 차는 원래 존에 잠긴 채 서 있다
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.zoneId).toBe(homeZoneId);
    expect(vehicle.doorLocked).toBe(true);
    expect(vehicle.engineOn).toBe(false);

    // 부름 한 바퀴가 닫혔다 — 이 차량에 남은 미완료 작업이 없다
    const remaining = await prisma.handlerTask.findMany({
      where: { vehicleId, status: { in: ['PENDING', 'ASSIGNED', 'EN_ROUTE'] } },
    });
    expect(remaining).toHaveLength(0);

    // 그리고 다음 이용자의 탐색에 원래 존의 "바로 픽업" 차량으로 다시 나타난다
    const startAt = slot(24 * 60);
    const q = `startAt=${encodeURIComponent(startAt.toISOString())}&endAt=${encodeURIComponent(
      addMin(startAt, 60).toISOString(),
    )}`;
    const search = await request(app.getHttpServer()).get(`/zones/${homeZoneId}?${q}`).expect(200);
    expect((search.body.vehicles as { id: string }[]).map((v) => v.id)).toContain(vehicleId);

    // 결제·정산도 앞뒤가 맞는다 — 부름 요금은 선결제에 포함돼 있었다
    const detail = await get('user', `/reservations/${reservationId}`).expect(200);
    expect(detail.body.deliveryFeeKrw).toBe(deliveryFeeKrw);
    const captured = (detail.body.payments as { status: string; amountKrw: number }[])
      .filter((p) => p.status === 'CAPTURED')
      .reduce((sum, p) => sum + p.amountKrw, 0);
    const rental = detail.body.rental as { driveFeeKrw: number; lateFeeKrw: number };
    expect(captured).toBe(detail.body.totalUpfrontKrw + rental.driveFeeKrw + rental.lateFeeKrw);
  });
});
