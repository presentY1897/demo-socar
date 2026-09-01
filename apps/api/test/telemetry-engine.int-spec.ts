/**
 * 텔레메트리 모의 엔진 통합 테스트 (M3-2).
 * - 조회 시점 계산: 운행 중 차량이 시간이 지나면 움직이고 연료가 준다
 * - write-through: 저장값이 묵으면 계산값으로 되쓴다
 * - 반납 스냅샷 확정
 * - SSE `/metrics/vehicles/live` 페이로드에 텔레메트리가 실린다 (OPS 전용)
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import type { IncomingMessage } from 'node:http';
import request from 'supertest';
import { liveVehiclesEventSchema } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { mockDrivenKm } from '../src/telemetry/telemetry-mock';
import { TelemetryService, WRITE_THROUGH_MS } from '../src/telemetry/telemetry.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const ZONE_POS = { lat: 37.544579, lng: 127.055961 }; // 성수역
const RETURN_POS = { lat: 37.497175, lng: 127.02758 }; // 강남역
const minutesAgo = (m: number) => new Date(Date.now() - m * 60000);
const minutesLater = (m: number) => new Date(Date.now() + m * 60000);

describe('텔레메트리 모의 엔진 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let telemetry: TelemetryService;
  let opsToken: string;
  let zoneId: string;
  let returnZoneId: string;
  let planId: string;
  const vehicleIds: string[] = [];
  const tag = `telemetry-${Date.now()}`;
  const zoneNames = [`${tag}-home`, `${tag}-return`];
  const emails = [`${tag}-ops@test.mocar.kr`, `${tag}-user@test.mocar.kr`];

  let plateSeq = 0;
  /** 존에 서 있는 차 1대 + 저장값(연료 80%, 주행거리 10,000km) */
  async function makeVehicle(storedAt: Date) {
    const seq = plateSeq++;
    const v = await prisma.vehicle.create({
      data: {
        modelName: '텔레메트리테스트카',
        plateNo: `${10 + (seq % 80)}텔${(Date.now() + seq) % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId, planId,
      },
    });
    vehicleIds.push(v.id);
    await prisma.vehicleTelemetry.create({
      data: {
        vehicleId: v.id, fuelPct: 80, odometerKm: 10000,
        doorLocked: false, engineOn: true, ...ZONE_POS, updatedAt: storedAt,
      },
    });
    return v.id;
  }

  /** 이 차량으로 진행 중인 대여를 만든다 (편도: 반납 존이 목적지) */
  async function makeActiveRental(vehicleId: string, startedAt: Date, endAt: Date, oneway = true) {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: emails[1] } })).id;
    const resv = await prisma.reservation.create({
      data: {
        userId, vehicleId, startAt: startedAt, endAt,
        status: 'IN_USE', insurance: 'STANDARD',
        returnZoneId: oneway ? returnZoneId : null,
        rentalFeeKrw: 12000, insuranceFeeKrw: 2800, totalUpfrontKrw: 14800,
        rental: { create: { status: 'IN_USE', startedAt } },
      },
      include: { rental: true },
    });
    return resv;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    telemetry = app.get(TelemetryService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: tag, baseHourlyKrw: 6000, weekendHourlyKrw: 6000, perKmKrw: 200,
        insuranceLightKrw: 600, insuranceStandardKrw: 1200, insuranceFullKrw: 1800,
      },
    });
    planId = plan.id;
    const [home, ret] = await Promise.all([
      prisma.zone.create({ data: { name: zoneNames[0], region: 'seoul', address: '성수', ...ZONE_POS, capacity: 5 } }),
      prisma.zone.create({ data: { name: zoneNames[1], region: 'seoul', address: '강남', ...RETURN_POS, capacity: 5 } }),
    ]);
    zoneId = home.id;
    returnZoneId = ret.id;

    const passwordHash = await bcrypt.hash('test1234', 4);
    await Promise.all([
      prisma.user.create({ data: { email: emails[0], name: '운영자', role: 'OPS_ADMIN', passwordHash } }),
      prisma.user.create({ data: { email: emails[1], name: '이용자', role: 'USER', passwordHash } }),
    ]);
    opsToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emails[0], password: 'test1234' })
        .expect(201)
    ).body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.handlerTask.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.rental.deleteMany({ where: { reservation: { vehicleId: { in: vehicleIds } } } });
    await prisma.payment.deleteMany({ where: { reservation: { vehicleId: { in: vehicleIds } } } });
    await prisma.reservation.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.zone.deleteMany({ where: { name: { in: zoneNames } } });
    await prisma.pricingPlan.deleteMany({ where: { name: tag } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('세워 둔 차는 시간이 지나도 값이 그대로다', async () => {
    const vehicleId = await makeVehicle(minutesAgo(300));
    const current = await telemetry.current(vehicleId);

    expect(current.state).toBe('IDLE');
    expect(current.odometerKm).toBe(10000);
    expect(current.fuelPct).toBe(80);
    expect(current.lat).toBeCloseTo(ZONE_POS.lat, 6);
    // 저장값도 손대지 않는다 — 대기 중인 차에 UPDATE가 나가면 그게 낭비다
    const stored = await prisma.vehicleTelemetry.findUniqueOrThrow({ where: { vehicleId } });
    expect(stored.odometerKm).toBe(10000);
  });

  it('운행 중이면 조회할 때마다 움직이고 연료가 준다', async () => {
    const startedAt = minutesAgo(120);
    const vehicleId = await makeVehicle(startedAt);
    await makeActiveRental(vehicleId, startedAt, minutesLater(120));

    const current = await telemetry.current(vehicleId);
    expect(current.state).toBe('IN_USE');
    expect(current.odometerKm).toBeGreaterThan(10000);
    expect(current.fuelPct).toBeLessThan(80);
    // 존과 반납 예정지 사이 어딘가 — 4시간 중 2시간 지났으니 대략 중간
    expect(current.lat).toBeLessThan(ZONE_POS.lat);
    expect(current.lat).toBeGreaterThan(RETURN_POS.lat);
    expect(current.lat).toBeCloseTo((ZONE_POS.lat + RETURN_POS.lat) / 2, 3);
  });

  it('저장값이 묵으면 계산값으로 되쓴다 (write-through)', async () => {
    const startedAt = minutesAgo(90);
    const vehicleId = await makeVehicle(startedAt);
    await makeActiveRental(vehicleId, startedAt, minutesLater(90));

    const before = await prisma.vehicleTelemetry.findUniqueOrThrow({ where: { vehicleId } });
    expect(before.odometerKm).toBe(10000); // 아직 계산 전

    const current = await telemetry.current(vehicleId);
    const after = await prisma.vehicleTelemetry.findUniqueOrThrow({ where: { vehicleId } });
    expect(after.odometerKm).toBeCloseTo(current.odometerKm, 1);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());

    // 갓 저장된 값은 곧바로 다시 쓰지 않는다 (1분 간격)
    const again = await telemetry.current(vehicleId);
    const twice = await prisma.vehicleTelemetry.findUniqueOrThrow({ where: { vehicleId } });
    expect(twice.updatedAt.getTime()).toBe(after.updatedAt.getTime());
    expect(again.odometerKm).toBeCloseTo(current.odometerKm, 0);
    expect(WRITE_THROUGH_MS).toBe(60_000);
  });

  it('여러 번 나눠 계산해도(write-through) 총 주행거리가 같다', async () => {
    const startedAt = minutesAgo(180);
    const vehicleId = await makeVehicle(startedAt);
    await makeActiveRental(vehicleId, startedAt, minutesLater(60));

    // 중간 조회(= write-through)를 여러 번 끼워 넣는다
    const at = (m: number) => new Date(startedAt.getTime() + m * 60000);
    await telemetry.current(vehicleId, at(60));
    await telemetry.current(vehicleId, at(120));
    const final = await telemetry.current(vehicleId, at(180));

    // 쪼개서 계산했어도 "3시간 × 그 차의 속도"와 같아야 한다 (반올림 오차만 허용)
    const expected = mockDrivenKm(vehicleId, startedAt, at(180));
    expect(final.odometerKm - 10000).toBeCloseTo(expected, 0);
  });

  it('반납하면 그 시점 값으로 스냅샷이 확정되고, 이후에는 더 이상 움직이지 않는다', async () => {
    const startedAt = minutesAgo(60);
    const vehicleId = await makeVehicle(startedAt);
    const resv = await makeActiveRental(vehicleId, startedAt, minutesLater(60));

    // 반납 경로(체크아웃 → 반납)는 M1이 검증한다 — 여기서는 스냅샷 확정만 본다.
    // 확정은 상태가 이미 COMPLETED로 바뀐 뒤에 불리므로 "언제부터 달렸는지"를 넘겨준다.
    const returnedAt = new Date();
    await prisma.reservation.update({ where: { id: resv.id }, data: { status: 'COMPLETED' } });
    await prisma.rental.update({
      where: { reservationId: resv.id },
      data: { status: 'COMPLETED', returnedAt },
    });
    const frozen = await telemetry.freeze(prisma, vehicleId, {
      position: RETURN_POS,
      drivenSince: startedAt,
      at: returnedAt,
    });

    expect(frozen.lat).toBeCloseTo(RETURN_POS.lat, 6);
    // 확정 주행거리 = 정산에 쓰는 거리와 같은 규칙 — 계기판과 청구가 어긋나지 않는다
    expect(frozen.odometerKm - 10000).toBeCloseTo(mockDrivenKm(vehicleId, startedAt, returnedAt), 0);

    // 대여가 끝났으니 이후 조회는 확정값 그대로
    const later = await telemetry.current(vehicleId, minutesLater(180));
    expect(later.state).toBe('IDLE');
    expect(later.odometerKm).toBe(frozen.odometerKm);
    expect(later.fuelPct).toBe(frozen.fuelPct);
  });

  it('탁송 중(EN_ROUTE)이면 상태가 탁송이고 작업 경로 위에 있다', async () => {
    const vehicleId = await makeVehicle(minutesAgo(20));
    await prisma.handlerTask.create({
      data: {
        type: 'REPOSITION', status: 'EN_ROUTE', vehicleId,
        fromZoneId: zoneId, toZoneId: returnZoneId,
        startedAt: minutesAgo(20), dueAt: minutesLater(60),
      },
    });

    const current = await telemetry.current(vehicleId);
    expect(current.state).toBe('IN_TRANSIT');
    // 출발 존을 떠나 도착 존 쪽으로 가고 있다
    expect(current.lat).toBeLessThan(ZONE_POS.lat);
    expect(current.lat).toBeGreaterThanOrEqual(RETURN_POS.lat);
  });

  it('SSE 실시간 채널에 텔레메트리가 실린다 — 운영 어드민만', async () => {
    await makeVehicle(minutesAgo(10));
    const server = app.getHttpServer();

    // EventSource는 커스텀 헤더를 못 붙여 ?token= 으로 인증한다
    const res = await request(server)
      .get(`/metrics/vehicles/live?token=${opsToken}`)
      .buffer(true)
      .parse((res, cb) => {
        // 첫 이벤트(startWith)만 받고 스트림을 끊는다 — 5초 틱을 기다릴 이유가 없다
        const stream = res as unknown as IncomingMessage;
        let raw = '';
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          cb(null, raw);
        };
        stream.on('data', (chunk: Buffer) => {
          raw += chunk.toString('utf8');
          if (raw.includes('\n\n')) {
            stream.destroy();
            finish();
          }
        });
        stream.on('close', finish);
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    const payload = liveVehiclesEventSchema.parse(
      JSON.parse(String(res.body).split('data: ')[1].split('\n')[0]),
    );
    expect(payload.vehicles.length).toBeGreaterThan(0);

    const mine = payload.vehicles.find((v) => v.id === vehicleIds[vehicleIds.length - 1])!;
    expect(mine.telemetry.fuelPct).toBe(80);
    expect(mine.telemetry.odometerKm).toBe(10000);
    expect(mine.state).toBe('IDLE');
  });

  it('SSE는 비 OPS 계정에 403', async () => {
    const userToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emails[1], password: 'test1234' })
        .expect(201)
    ).body.accessToken as string;

    await request(app.getHttpServer())
      .get(`/metrics/vehicles/live?token=${userToken}`)
      .expect(403);
    await request(app.getHttpServer()).get('/metrics/vehicles/live').expect(401);
  });
});
