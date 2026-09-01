/**
 * M1 전체 동선 E2E 통합 테스트 — 한 예약의 전 생애를 처음부터 끝까지 한 번에 완주한다.
 *
 * 개별 기능의 경계 조건은 각 기능의 스펙(`checkin-checkout` · `smart-key` ·
 * `return-zone-change` · `vehicle-manual` · `lifecycle`)이 덮는다. 이 스펙이 보는 것은
 * **기능들이 이어 붙었을 때 한 예약이 끝까지 굴러가는가** — M1이 병렬 트랙 두 개를
 * 합친 결과라, 통합 지점이 실제로 맞물리는지를 배포 전에 확인하는 자리다.
 *
 *   예약 생성(결제) → 예약 변경(시각 + 반납 존, 차액 정산) → 이용 시작
 *   → [게이트] 체크인 전 스마트키 403 → 체크인(사진) → 스마트키 조작 → 매뉴얼 조회
 *   → 연장(연장분 결제) → [게이트] 체크아웃 전 반납 409 → 체크아웃(사진 + 주차 위치)
 *   → 반납 → 주행요금 정산 + 편도 존 이동
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
  FREE_DRIVE_KM,
  ONEWAY_FEE_MIN_KRW,
  PHOTO_MIME,
  settle,
  type RentalUsageRes,
} from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const SLOT_MS = 10 * 60 * 1000;
/** 지금 이후의 가장 가까운 10분 경계 (예약 슬롯 정렬) */
const nextBoundary = (from = Date.now()) => new Date(Math.floor(from / SLOT_MS) * SLOT_MS + SLOT_MS);
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const photo = () => ({ mime: PHOTO_MIME, data: Buffer.alloc(900, 7).toString('base64') });

// 주중/주말 단가를 같게 둬서 "시각 변경"이 요일을 넘어도 대여요금이 흔들리지 않게 한다 —
// 이 스펙이 보려는 건 요금표가 아니라 차액 정산 경로다.
const HOURLY_KRW = 6000;
const INSURANCE_STANDARD_HOURLY_KRW = 1200;
/** 60분 = 6슬롯 */
const HOUR_RENTAL_KRW = HOURLY_KRW;
const HOUR_INSURANCE_KRW = INSURANCE_STANDARD_HOURLY_KRW;

describe('M1 이용 플로우 E2E (통합) — 한 예약의 전 생애', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let vehicleId: string;
  let startZoneId: string;
  let returnZoneId: string;

  // 단계 사이로 넘기는 상태 — 아래 it 들은 순서대로 한 동선을 이어 간다
  let reservationId: string;
  let rentalId: string;
  let rentalStartAt: Date;
  let upfrontAfterCreateKrw = 0;
  let upfrontAfterModifyKrw = 0;

  const stamp = Date.now();
  const tag = `m1-e2e-${stamp}`;
  const email = `${tag}@test.mocar.kr`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: tag,
        baseHourlyKrw: HOURLY_KRW,
        weekendHourlyKrw: HOURLY_KRW,
        perKmKrw: 200,
        insuranceLightKrw: 600,
        insuranceStandardKrw: INSURANCE_STANDARD_HOURLY_KRW,
        insuranceFullKrw: 1800,
      },
    });
    // 두 존 거리 ≈ 1.6km — 편도 수수료가 최소액(5,000원)에 걸린다
    const [start, ret] = await Promise.all([
      prisma.zone.create({
        data: { name: `${tag}-start`, region: 'seoul', address: '건대입구', lat: 37.5445, lng: 127.0559, capacity: 4 },
      }),
      prisma.zone.create({
        data: { name: `${tag}-return`, region: 'seoul', address: '성수', lat: 37.5441, lng: 127.0376, capacity: 4 },
      }),
    ]);
    startZoneId = start.id;
    returnZoneId = ret.id;

    // 매뉴얼이 등록된 실제 차종으로 둔다 (M1-6 조회 단계에서 기본값 대체가 아닌 진짜 콘텐츠를 본다)
    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '아반떼',
        plateNo: `95테${stamp % 10000}`,
        fuel: 'GASOLINE',
        seats: 5,
        zoneId: start.id,
        planId: plan.id,
      },
    });
    vehicleId = vehicle.id;

    await prisma.user.create({
      data: { email, name: 'E2E 이용자', role: 'USER', passwordHash: await bcrypt.hash('test1234', 4) },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'test1234' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.vehicleControlLog.deleteMany({ where: { vehicleId } });
    await prisma.conditionPhoto.deleteMany({ where: { report: { rental: { reservation: { vehicleId } } } } });
    await prisma.conditionReport.deleteMany({ where: { rental: { reservation: { vehicleId } } } });
    await prisma.payment.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.rental.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.pricingPlan.deleteMany({ where: { name: tag } });
    await prisma.creditLedger.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);
  const patch = (path: string) =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${token}`);
  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const control = (action: string) => post(`/rentals/${rentalId}/control`).send({ action });
  const controlActions = async () =>
    (
      await prisma.vehicleControlLog.findMany({ where: { rentalId }, orderBy: { at: 'asc' } })
    ).map((l) => l.action);

  it('① 예약을 만들면 선결제가 승인된다', async () => {
    // 변경 여지를 두고 2시간 뒤 슬롯으로 먼저 잡는다 (왕복 · 1시간)
    const startAt = nextBoundary(Date.now() + 2 * 3600 * 1000);
    const res = await post('/reservations').send({
      vehicleId,
      startAt: startAt.toISOString(),
      endAt: addMin(startAt, 60).toISOString(),
      insurance: 'STANDARD',
      useCredit: false,
      cardLast4: '4242',
      idempotencyKey: randomUUID(),
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.returnZoneId).toBeNull();
    expect(res.body.onewayFeeKrw).toBe(0);
    expect(res.body.rentalFeeKrw).toBe(HOUR_RENTAL_KRW);
    expect(res.body.insuranceFeeKrw).toBe(HOUR_INSURANCE_KRW);
    expect(res.body.totalUpfrontKrw).toBe(HOUR_RENTAL_KRW + HOUR_INSURANCE_KRW);

    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0]).toMatchObject({
      kind: 'UPFRONT',
      status: 'CAPTURED',
      amountKrw: res.body.totalUpfrontKrw,
    });

    reservationId = res.body.id;
    upfrontAfterCreateKrw = res.body.totalUpfrontKrw;
  });

  it(
    '② 이용 전 예약 변경 — 시각을 당기고 편도로 바꾸면 차액만 추가 결제된다',
    async () => {
      // 변경 후 곧바로 이용을 시작하려면 새 시작 시각이 (지금, 지금+10분] 안에 있어야 한다:
      // 변경(PATCH)은 미래 시각만 받고, 이용 시작은 시작 10분 전부터 열리기 때문.
      // 다음 경계가 코앞이면 지나갈 때까지 잠깐 기다렸다가 그다음 경계를 쓴다.
      let startAt = nextBoundary();
      if (startAt.getTime() - Date.now() < 20_000) {
        await sleep(startAt.getTime() - Date.now() + 1_000);
        startAt = nextBoundary();
      }
      rentalStartAt = startAt;

      const res = await patch(`/reservations/${reservationId}`).send({
        startAt: startAt.toISOString(),
        endAt: addMin(startAt, 60).toISOString(),
        returnZoneId,
        idempotencyKey: randomUUID(),
      });

      expect(res.status).toBe(200);
      expect(res.body.startAt).toBe(startAt.toISOString());
      expect(res.body.returnZoneId).toBe(returnZoneId);
      // 1.6km 떨어진 존이라 거리 요금(800원)이 아니라 최소 수수료가 적용된다
      expect(res.body.onewayFeeKrw).toBe(ONEWAY_FEE_MIN_KRW);
      // 이용 시간 길이는 그대로라 대여요금·면책상품은 변하지 않는다
      expect(res.body.rentalFeeKrw).toBe(HOUR_RENTAL_KRW);
      expect(res.body.insuranceFeeKrw).toBe(HOUR_INSURANCE_KRW);
      expect(res.body.totalUpfrontKrw).toBe(upfrontAfterCreateKrw + ONEWAY_FEE_MIN_KRW);

      // 차액은 재결제가 아니라 "차액만" 추가 승인된다 (ADR-002 — 모의 PG에 부분 환불이 없다)
      const payments = await prisma.payment.findMany({
        where: { reservationId, kind: 'UPFRONT' },
        orderBy: { createdAt: 'asc' },
      });
      expect(payments).toHaveLength(2);
      expect(payments[1].amountKrw).toBe(ONEWAY_FEE_MIN_KRW);
      expect(payments[1].status).toBe('CAPTURED');

      upfrontAfterModifyKrw = res.body.totalUpfrontKrw;
    },
    60_000,
  );

  it('③ 이용을 시작하면 대여가 열린다', async () => {
    const res = await post('/rentals/start').send({ reservationId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('IN_USE');
    rentalId = res.body.id;

    const detail = await get(`/reservations/${reservationId}`);
    expect(detail.body.status).toBe('IN_USE');

    // 단계형 화면이 보는 단일 소스 — 시작 직후에는 아무 단계도 끝나지 않았고 차는 잠겨 있다
    const usage = await get(`/rentals/${rentalId}/usage`);
    expect(usage.status).toBe(200);
    expect(usage.body as RentalUsageRes).toMatchObject({
      rentalId,
      checkIn: null,
      checkOut: null,
      smartKey: { doorLocked: true, engineOn: false, lastAction: null },
    });
  });

  it('④ [게이트] 체크인 전에는 스마트키가 403 — 로그도 차량 상태도 그대로다', async () => {
    const blocked = await control('UNLOCK');
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toContain('체크인');

    expect(await controlActions()).toEqual([]);
    // 문 잠금·시동은 M3-1에서 Vehicle → VehicleTelemetry로 이관됐다
    const telemetry = await prisma.vehicleTelemetry.findUniqueOrThrow({ where: { vehicleId } });
    expect(telemetry).toMatchObject({ doorLocked: true, engineOn: false });
  });

  it('⑤ 체크인(사진 2장 + 상태 메모)을 마치면 스마트키가 열린다', async () => {
    const res = await post(`/rentals/${rentalId}/check-in`).send({
      notes: '앞범퍼 우측 하단 기존 흠집 · 실내 청결',
      photos: [photo(), photo()],
    });
    expect(res.status).toBe(201);
    expect(res.body.phase).toBe('CHECK_IN');
    expect(res.body.photos).toHaveLength(2);
    // 사진은 화면이 바로 <img src>에 물리는 data: URI로 돌아온다 (외부 스토리지 없음)
    expect(res.body.photos[0].dataUri).toMatch(/^data:image\/jpeg;base64,/);

    const usage = await get(`/rentals/${rentalId}/usage`);
    expect(usage.body.checkIn.id).toBe(res.body.id);
    expect(usage.body.checkOut).toBeNull();
  });

  it('⑥ 스마트키 — 문 열기 → 시동 → (시동 중 잠금 400) → 시동 끄기 → 잠금', async () => {
    const unlocked = await control('UNLOCK');
    expect(unlocked.status).toBe(201);
    expect(unlocked.body.state).toMatchObject({ doorLocked: false, engineOn: false });

    const ignitionOn = await control('IGNITION_ON');
    expect(ignitionOn.status).toBe(201);
    expect(ignitionOn.body.state).toMatchObject({ doorLocked: false, engineOn: true });

    // 시동이 걸린 채 잠그면 차 안에 키를 두고 잠그는 상황이 된다 → 400
    const lockWhileRunning = await control('LOCK');
    expect(lockWhileRunning.status).toBe(400);
    expect(lockWhileRunning.body.message).toContain('시동');

    expect((await control('IGNITION_OFF')).status).toBe(201);
    const locked = await control('LOCK');
    expect(locked.status).toBe(201);
    expect(locked.body.state).toMatchObject({ doorLocked: true, engineOn: false });

    // 거절된 LOCK은 로그에 없다 — 로그는 "실제로 차에 일어난 일"이어야 한다
    expect(await controlActions()).toEqual(['UNLOCK', 'IGNITION_ON', 'IGNITION_OFF', 'LOCK']);

    const usage = await get(`/rentals/${rentalId}/usage`);
    expect(usage.body.smartKey).toMatchObject({
      doorLocked: true,
      engineOn: false,
      lastAction: 'LOCK',
    });
  });

  it('⑦ 이용 중 차종 매뉴얼을 본다 — 이 차의 연료에 맞는 내용이 온다', async () => {
    const res = await request(app.getHttpServer()).get(`/vehicles/${vehicleId}/manual`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ vehicleId, modelName: '아반떼', fuel: 'GASOLINE' });

    const section = (title: string) =>
      (res.body.sections as { title: string; body: string }[]).find((s) => s.title === title)!.body;
    expect(section('주유 · 충전')).toContain('주유구');
    expect(section('반납 전 체크리스트')).toContain('연료 게이지');
  });

  it('⑧ 이용 중 반납을 연장하면 연장분만 추가 결제된다', async () => {
    const newEndAt = addMin(rentalStartAt, 90); // 60분 → 90분
    const res = await post(`/rentals/${rentalId}/extend`).send({
      endAt: newEndAt.toISOString(),
      idempotencyKey: randomUUID(),
    });
    expect(res.status).toBe(201);

    // 연장 30분 = 대여요금 3,000 + 면책상품 600
    const extensionKrw = HOURLY_KRW / 2 + INSURANCE_STANDARD_HOURLY_KRW / 2;
    expect(res.body.reservation.endAt).toBe(newEndAt.toISOString());
    expect(res.body.reservation.totalUpfrontKrw).toBe(upfrontAfterModifyKrw + extensionKrw);

    const payments = await prisma.payment.findMany({
      where: { reservationId, kind: 'UPFRONT' },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments).toHaveLength(3);
    expect(payments[2].amountKrw).toBe(extensionKrw);
  });

  it('⑨ [게이트] 체크아웃 전 반납은 409 — 다음 이용자가 차를 찾을 단서가 없다', async () => {
    const res = await post(`/rentals/${rentalId}/return`).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('체크아웃');

    const rental = await prisma.rental.findUniqueOrThrow({ where: { id: rentalId } });
    expect(rental.status).toBe('IN_USE');
  });

  it('⑩ 체크아웃(주차 위치 사진 + 층/구역)을 제출한다', async () => {
    const res = await post(`/rentals/${rentalId}/check-out`).send({
      parkingNote: '지하 2층 B-14 (기둥 옆)',
      photos: [photo()],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ phase: 'CHECK_OUT', parkingNote: '지하 2층 B-14 (기둥 옆)' });

    const usage = await get(`/rentals/${rentalId}/usage`);
    expect(usage.body.checkIn).not.toBeNull();
    expect(usage.body.checkOut.parkingNote).toBe('지하 2층 B-14 (기둥 옆)');
  });

  it('⑪ 반납하면 주행요금이 정산되고 차량이 반납 존으로 이동한다', async () => {
    const res = await post(`/rentals/${rentalId}/return`).send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.reservation.status).toBe('COMPLETED');

    // 주행거리는 사용자 입력이 아니라 텔레메트리(모의)가 확정한다
    const distanceKm = res.body.distanceKm as number;
    expect(distanceKm).toBeGreaterThan(0);
    expect(res.body.lateMinutes).toBe(0); // 연장한 반납 시각 안에 돌려줬다

    // 정산 결과가 요금 엔진과 정확히 같은지 대조한다 (짧은 데모 주행은 30km 무료 구간)
    const expected = settle({
      plan: { perKmKrw: 200 },
      fuel: 'GASOLINE',
      distanceKm,
      lateMinutes: 0,
    });
    expect(distanceKm).toBeLessThan(FREE_DRIVE_KM);
    expect(res.body.driveFeeKrw).toBe(expected.driveFeeKrw);
    expect(res.body.lateFeeKrw).toBe(expected.lateFeeKrw);
    expect(expected.totalKrw).toBe(0);

    // 편도: 차량의 물리 위치가 반납 존으로 옮겨진다 (ADR-005)
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.zoneId).toBe(returnZoneId);
    expect(vehicle.zoneId).not.toBe(startZoneId);
  });

  it('⑫ 동선이 끝나면 결제 합계·증빙·조작 로그가 모두 앞뒤가 맞는다', async () => {
    const detail = await get(`/reservations/${reservationId}`);
    expect(detail.status).toBe(200);

    const payments = detail.body.payments as { kind: string; status: string; amountKrw: number }[];
    // 선결제 3건(최초 · 편도 차액 · 연장분) — 정산액이 0원이면 결제를 만들지 않는다
    expect(payments.filter((p) => p.kind === 'UPFRONT')).toHaveLength(3);
    expect(payments.filter((p) => p.kind === 'DRIVE_SETTLEMENT')).toHaveLength(0);

    const captured = payments
      .filter((p) => p.status === 'CAPTURED')
      .reduce((sum, p) => sum + p.amountKrw, 0);
    const rental = detail.body.rental as { driveFeeKrw: number; lateFeeKrw: number };
    expect(captured).toBe(
      detail.body.totalUpfrontKrw + rental.driveFeeKrw + rental.lateFeeKrw,
    );

    // 증빙: 체크인/체크아웃 각 1건 + 사진 3장이 남았다
    const reports = await prisma.conditionReport.findMany({
      where: { rentalId },
      include: { photos: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(reports.map((r) => r.phase)).toEqual(['CHECK_IN', 'CHECK_OUT']);
    expect(reports.flatMap((r) => r.photos)).toHaveLength(3);

    expect(await controlActions()).toEqual(['UNLOCK', 'IGNITION_ON', 'IGNITION_OFF', 'LOCK']);
  });
});
