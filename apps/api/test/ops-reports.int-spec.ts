/**
 * 리포트 빌더 API 통합 테스트 (M4-2) — `GET /ops/reports`.
 *
 * 시드 데이터에 섞여 있으면 "집계가 맞다"를 증명할 수 없어서, 전용 존·차량·예약·결제·이용·
 * 작업을 심고 **그 존으로 좁혀** 값을 손계산과 대조한다. 지표 5종 × 허용 축 전 조합을 돈다.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { ReportOptionsRes, ReportResponseRes } from '@socar/shared';
import { REPORT_METRIC_META } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

/** KST 벽시계 → 실제 시각 */
const kst = (s: string) => new Date(`${s}+09:00`);

const FROM = '2026-08-10';
const TO = '2026-08-12';

describe('/ops/reports (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let opsToken: string;
  let userToken: string;
  let handlerToken: string;

  const tag = `report-${Date.now()}`;
  const modelA = `${tag}-A`;
  const modelB = `${tag}-B`;
  let zoneId: string;
  let emptyZoneId: string;
  let vehicleAId: string;
  let vehicleBId: string;

  const server = () => app.getHttpServer();
  const auth = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  /** 전용 존으로 좁힌 리포트 — 시드 데이터가 섞이지 않는다 */
  const report = async (params: Record<string, string>): Promise<ReportResponseRes> => {
    const res = await auth(opsToken)(
      request(server())
        .get('/ops/reports')
        .query({ from: FROM, to: TO, zoneId, ...params }),
    ).expect(200);
    return res.body as ReportResponseRes;
  };

  const valueOf = (body: ReportResponseRes, key: string) =>
    body.rows.find((r) => r.key === key)?.value;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    if ((meta?.version ?? 0) < SEED_VERSION) await runSeed(prisma);

    const login = async (email: string) =>
      (await request(server()).post('/auth/login').send({ email, password: 'demo1234' }).expect(201))
        .body.accessToken as string;
    [opsToken, userToken, handlerToken] = await Promise.all([
      login('ops@demo.mocar.kr'),
      login('user@demo.mocar.kr'),
      login('handler@demo.mocar.kr'),
    ]);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'user@demo.mocar.kr' } });
    const plan = await prisma.pricingPlan.findFirstOrThrow();

    const zone = await prisma.zone.create({
      data: {
        name: `${tag}-zone`,
        region: 'seoul',
        address: '테스트',
        lat: 37.5,
        lng: 127.0,
        capacity: 4,
      },
    });
    zoneId = zone.id;
    emptyZoneId = (
      await prisma.zone.create({
        data: {
          name: `${tag}-empty`,
          region: 'seoul',
          address: '테스트',
          lat: 37.5,
          lng: 127.0,
          capacity: 2,
        },
      })
    ).id;

    const vehicle = (modelName: string, plateNo: string) =>
      prisma.vehicle.create({
        data: { modelName, plateNo, fuel: 'EV', seats: 5, zoneId: zone.id, planId: plan.id },
      });
    vehicleAId = (await vehicle(modelA, `${tag}-A1`)).id;
    vehicleBId = (await vehicle(modelB, `${tag}-B1`)).id;

    const fees = { rentalFeeKrw: 0, insuranceFeeKrw: 0, totalUpfrontKrw: 0 };

    // R1 — 8/10 09:00~12:00 (3시간), 30분 지연 반납, 결제 30,000원
    await prisma.reservation.create({
      data: {
        userId: user.id,
        vehicleId: vehicleAId,
        startAt: kst('2026-08-10T09:00:00'),
        endAt: kst('2026-08-10T12:00:00'),
        status: 'COMPLETED',
        insurance: 'STANDARD',
        ...fees,
        rental: {
          create: {
            status: 'COMPLETED',
            startedAt: kst('2026-08-10T09:00:00'),
            returnedAt: kst('2026-08-10T12:30:00'),
            lateMinutes: 30,
          },
        },
        payments: {
          create: {
            kind: 'UPFRONT',
            amountKrw: 30_000,
            status: 'CAPTURED',
            idempotencyKey: `${tag}-p1`,
            approvedAt: kst('2026-08-10T09:00:00'),
          },
        },
      },
    });

    // R2 — 8/11 하루 종일(24시간), 정시 반납, 결제 50,000원
    await prisma.reservation.create({
      data: {
        userId: user.id,
        vehicleId: vehicleBId,
        startAt: kst('2026-08-11T00:00:00'),
        endAt: kst('2026-08-12T00:00:00'),
        status: 'COMPLETED',
        insurance: 'STANDARD',
        ...fees,
        rental: {
          create: {
            status: 'COMPLETED',
            startedAt: kst('2026-08-11T00:00:00'),
            returnedAt: kst('2026-08-12T00:00:00'),
            lateMinutes: 0,
          },
        },
        payments: {
          create: {
            kind: 'UPFRONT',
            amountKrw: 50_000,
            status: 'CAPTURED',
            idempotencyKey: `${tag}-p2`,
            approvedAt: kst('2026-08-11T10:00:00'),
          },
        },
      },
    });

    // R3 — 8/12 22:00 ~ 8/13 02:00 (자정을 넘는다). 결제는 실패 건이라 매출에 잡히면 안 된다
    await prisma.reservation.create({
      data: {
        userId: user.id,
        vehicleId: vehicleAId,
        startAt: kst('2026-08-12T22:00:00'),
        endAt: kst('2026-08-13T02:00:00'),
        status: 'CONFIRMED',
        insurance: 'STANDARD',
        ...fees,
        payments: {
          create: {
            kind: 'UPFRONT',
            amountKrw: 99_000,
            status: 'FAILED',
            idempotencyKey: `${tag}-p3`,
            approvedAt: kst('2026-08-12T22:00:00'),
          },
        },
      },
    });

    // 완료된 작업 1건 (8/10) — 처리량의 유일한 정답
    await prisma.handlerTask.create({
      data: {
        type: 'REPOSITION',
        status: 'DONE',
        vehicleId: vehicleAId,
        fromZoneId: zone.id,
        toZoneId: emptyZoneId,
        dueAt: kst('2026-08-10T16:00:00'),
        completedAt: kst('2026-08-10T15:00:00'),
      },
    });
  });

  afterAll(async () => {
    const vehicleIds = [vehicleAId, vehicleBId];
    await prisma.handlerTask.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.payment.deleteMany({ where: { reservation: { vehicleId: { in: vehicleIds } } } });
    await prisma.rental.deleteMany({ where: { reservation: { vehicleId: { in: vehicleIds } } } });
    await prisma.reservation.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.zone.deleteMany({ where: { id: { in: [zoneId, emptyZoneId] } } });
    await app.close();
  });

  // ─────────────────────────── 권한 ───────────────────────────

  it('리포트는 OPS 전용이다 — 비 OPS 403 · 비로그인 401', async () => {
    for (const path of ['/ops/reports?metric=revenue&groupBy=day', '/ops/reports/options']) {
      await auth(userToken)(request(server()).get(path)).expect(403);
      await auth(handlerToken)(request(server()).get(path)).expect(403);
      await request(server()).get(path).expect(401);
    }
  });

  // ─────────────────────────── 파라미터 검증 ───────────────────────────

  it('허용되지 않는 metric × groupBy 조합은 400이고 왜 안 되는지 말해 준다', async () => {
    const res = await auth(opsToken)(
      request(server()).get('/ops/reports').query({ metric: 'zoneOccupancy', groupBy: 'day' }),
    ).expect(400);
    expect(JSON.stringify(res.body)).toContain('존별');

    await auth(opsToken)(
      request(server()).get('/ops/reports').query({ metric: 'zoneOccupancy', groupBy: 'model' }),
    ).expect(400);
    await auth(opsToken)(
      request(server()).get('/ops/reports').query({ metric: 'taskThroughput', groupBy: 'model' }),
    ).expect(400);
  });

  it('지표 사전이 허용한 조합은 전부 200이다 (화면 선택지 = API 허용 목록)', async () => {
    for (const [metric, meta] of Object.entries(REPORT_METRIC_META)) {
      for (const groupBy of meta.groupBys) {
        const body = await report({ metric, groupBy });
        expect(body.meta).toMatchObject({ metric, groupBy, unit: meta.unit });
      }
    }
  });

  it('잘못된 파라미터는 400 — 지표 누락·오타·형식·역전·상한', async () => {
    const bad: Record<string, string>[] = [
      { groupBy: 'day' }, // metric 없음
      { metric: 'revenue' }, // groupBy 없음
      { metric: 'profit', groupBy: 'day' }, // 없는 지표
      { metric: 'revenue', groupBy: 'handler' }, // 없는 축
      { metric: 'revenue', groupBy: 'day', from: '2026/08/01' }, // 형식
      { metric: 'revenue', groupBy: 'day', from: '2026-08-10', to: '2026-08-01' }, // 역전
      { metric: 'revenue', groupBy: 'day', from: '2020-01-01', to: '2026-01-01' }, // 366일 초과
    ];
    for (const query of bad) {
      await auth(opsToken)(request(server()).get('/ops/reports').query(query)).expect(400);
    }
  });

  // ─────────────────────────── 매출 ───────────────────────────

  it('매출×일자: 승인된 결제만, 빠진 날은 0으로 채워 이어진다', async () => {
    const body = await report({ metric: 'revenue', groupBy: 'day' });

    expect(body.rows.map((r) => r.key)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
    expect(body.rows.map((r) => r.value)).toEqual([30_000, 50_000, 0]);
    // 실패한 99,000원 결제는 어디에도 없다
    expect(body.meta.total).toBe(80_000);
    expect(body.meta).toMatchObject({
      unit: 'krw',
      range: { from: FROM, to: TO },
      filters: { zoneId, model: null },
    });
  });

  it('매출×차종: 큰 값부터 놓이고 합이 전체와 같다', async () => {
    const body = await report({ metric: 'revenue', groupBy: 'model' });

    expect(body.rows).toEqual([
      { key: modelB, label: modelB, value: 50_000 },
      { key: modelA, label: modelA, value: 30_000 },
    ]);
    expect(body.rows.reduce((s, r) => s + r.value, 0)).toBe(body.meta.total);
  });

  it('매출×존: 존 이름을 라벨로 싣는다', async () => {
    const body = await report({ metric: 'revenue', groupBy: 'zone' });

    expect(body.rows).toEqual([{ key: zoneId, label: `${tag}-zone`, value: 80_000 }]);
  });

  it('차종 필터가 실제로 반영된다', async () => {
    const body = await report({ metric: 'revenue', groupBy: 'day', model: modelA });

    expect(body.rows.map((r) => r.value)).toEqual([30_000, 0, 0]);
    expect(body.meta.filters.model).toBe(modelA);
  });

  it('기간 필터가 실제로 반영된다 — 하루만 보면 그날 매출만 남는다', async () => {
    const body = await report({
      metric: 'revenue',
      groupBy: 'day',
      from: '2026-08-11',
      to: '2026-08-11',
    });

    expect(body.rows).toEqual([{ key: '2026-08-11', label: '2026-08-11', value: 50_000 }]);
    expect(body.meta.total).toBe(50_000);
  });

  it('기간을 안 주면 최근 30일 (KST 오늘까지)', async () => {
    const body = await report({ metric: 'revenue', groupBy: 'day', from: '', to: '' });
    expect(body.rows).toHaveLength(30);
  });

  // ─────────────────────────── 가동률 ───────────────────────────

  it('가동률×일자: 자정을 넘는 예약도 하루씩 잘라 나눈다', async () => {
    const body = await report({ metric: 'utilization', groupBy: 'day' });

    // 차량 2대 × 24시간 = 하루 48시간이 분모
    expect(valueOf(body, '2026-08-10')).toBeCloseTo((3 / 48) * 100, 1); // 3시간
    expect(valueOf(body, '2026-08-11')).toBeCloseTo(50, 1); // 24시간
    expect(valueOf(body, '2026-08-12')).toBeCloseTo((2 / 48) * 100, 1); // 22:00~24:00 = 2시간
    // 전체는 행 평균이 아니라 (총 점유 시간 ÷ 총 가용 시간)
    expect(body.meta.total).toBeCloseTo((29 / (2 * 72)) * 100, 1);
    expect(body.meta.unit).toBe('pct');
  });

  it('가동률×차종: 그룹마다 분모(차량 수)가 다르다', async () => {
    const body = await report({ metric: 'utilization', groupBy: 'model' });

    expect(valueOf(body, modelA)).toBeCloseTo((5 / 72) * 100, 1); // 3 + 2시간, 1대
    expect(valueOf(body, modelB)).toBeCloseTo((24 / 72) * 100, 1); // 24시간, 1대
    expect(body.rows[0].key).toBe(modelB); // 큰 값부터
  });

  it('가동률×존', async () => {
    const body = await report({ metric: 'utilization', groupBy: 'zone' });

    expect(valueOf(body, zoneId)).toBeCloseTo((29 / 144) * 100, 1);
  });

  // ─────────────────────────── 존 점유율 ───────────────────────────

  it('존 점유율: 배정 차량 ÷ 면수, 빈 존도 0%로 남는다', async () => {
    const filtered = await report({ metric: 'zoneOccupancy', groupBy: 'zone' });
    expect(filtered.rows).toEqual([{ key: zoneId, label: `${tag}-zone`, value: 50 }]); // 2대 / 4면

    const all = await report({ metric: 'zoneOccupancy', groupBy: 'zone', zoneId: '' });
    expect(valueOf(all, emptyZoneId)).toBe(0);
    expect(valueOf(all, zoneId)).toBe(50);
  });

  it('존 점유율은 기간을 바꿔도 움직이지 않는다 (현재 스냅샷)', async () => {
    const august = await report({ metric: 'zoneOccupancy', groupBy: 'zone' });
    const oneDay = await report({
      metric: 'zoneOccupancy',
      groupBy: 'zone',
      from: '2026-08-11',
      to: '2026-08-11',
    });

    expect(oneDay.rows).toEqual(august.rows);
    expect(REPORT_METRIC_META.zoneOccupancy.periodSensitive).toBe(false);
  });

  // ─────────────────────────── 작업 처리량 ───────────────────────────

  it('작업 처리량: 완료된 작업만, 출발 존 기준', async () => {
    const byDay = await report({ metric: 'taskThroughput', groupBy: 'day' });
    expect(byDay.rows.map((r) => r.value)).toEqual([1, 0, 0]);
    expect(byDay.meta.total).toBe(1);
    expect(byDay.meta.unit).toBe('count');

    const byZone = await report({ metric: 'taskThroughput', groupBy: 'zone' });
    expect(byZone.rows).toEqual([{ key: zoneId, label: `${tag}-zone`, value: 1 }]);

    // 도착 존으로는 잡히지 않는다 — 출발 존이 기준이다
    const arrival = await report({ metric: 'taskThroughput', groupBy: 'zone', zoneId: emptyZoneId });
    expect(arrival.rows).toEqual([]);
  });

  // ─────────────────────────── 지연 반납률 ───────────────────────────

  it('지연 반납률: 반납 시각이 속한 날에 잡히고 전체는 가중 평균이다', async () => {
    const byDay = await report({ metric: 'lateReturnRate', groupBy: 'day' });

    expect(valueOf(byDay, '2026-08-10')).toBe(100); // 1건 중 1건 지연
    expect(valueOf(byDay, '2026-08-11')).toBe(0); // 반납 없음
    expect(valueOf(byDay, '2026-08-12')).toBe(0); // 1건 중 0건
    expect(byDay.meta.total).toBe(50); // 2건 중 1건 — 행 평균(33.3%)이 아니다
  });

  it('지연 반납률×차종·존', async () => {
    const byModel = await report({ metric: 'lateReturnRate', groupBy: 'model' });
    expect(valueOf(byModel, modelA)).toBe(100);
    expect(valueOf(byModel, modelB)).toBe(0);

    const byZone = await report({ metric: 'lateReturnRate', groupBy: 'zone' });
    expect(valueOf(byZone, zoneId)).toBe(50);
  });

  // ─────────────────────────── 필터 선택지 ───────────────────────────

  it('필터 선택지: 존과 차종 목록을 이름순으로 준다', async () => {
    const res = await auth(opsToken)(request(server()).get('/ops/reports/options')).expect(200);
    const body = res.body as ReportOptionsRes;

    expect(body.zones.some((z) => z.id === zoneId)).toBe(true);
    expect(body.models).toContain(modelA);
    expect(body.models).toContain(modelB);
    // 차종은 중복 없이
    expect(new Set(body.models).size).toBe(body.models.length);
  });
});
