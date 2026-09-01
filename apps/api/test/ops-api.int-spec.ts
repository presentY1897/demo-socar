/**
 * /ops API 통합 테스트 (M3-3) — 운영 센터 화면(M3-4~6)이 쓸 백엔드 전체.
 * - fleet 목록/상세/차량 등록/정비 메모 · 존 계약(잔여 자리) · 유의 유저 · 문의 답변 · 회계 · 경고
 * - 전 엔드포인트 OPS 전용 (비 OPS 403 · 비로그인 401)
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type {
  InquiryRes,
  OpsAccountingSummaryRes,
  OpsAlertRes,
  OpsFleetDetailRes,
  OpsFleetVehicleRes,
  OpsInquiryRes,
  OpsMaintenanceNoteRes,
  OpsOverviewRes,
  OpsUserDetailRes,
  OpsUserRiskRes,
  OpsZoneRes,
} from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const inDays = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000);

describe('/ops API (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let opsToken: string;
  let userToken: string;
  let handlerToken: string;
  let planId: string;
  let testZoneId: string;
  const tag = `ops-api-${Date.now()}`;
  const createdVehicleIds: string[] = [];

  const auth = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const asOps = (r: request.Test) => auth(opsToken)(r);
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    if ((meta?.version ?? 0) < SEED_VERSION) await runSeed(prisma);

    const login = async (email: string) =>
      (
        await request(server())
          .post('/auth/login')
          .send({ email, password: 'demo1234' })
          .expect(201)
      ).body.accessToken as string;
    [opsToken, userToken, handlerToken] = await Promise.all([
      login('ops@demo.mocar.kr'),
      login('user@demo.mocar.kr'),
      login('handler@demo.mocar.kr'),
    ]);

    planId = (await prisma.pricingPlan.findFirstOrThrow()).id;
    // 계약 수정 테스트는 시드 존을 건드리지 않는다 — 경고 데모 케이스가 시드에 심겨 있어서
    const zone = await prisma.zone.create({
      data: { name: `${tag}-zone`, region: 'seoul', address: '테스트', lat: 37.5445, lng: 127.0559, capacity: 3 },
    });
    testZoneId = zone.id;
  });

  afterAll(async () => {
    await prisma.vehicleMaintenanceNote.deleteMany({ where: { vehicleId: { in: createdVehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: createdVehicleIds } } });
    await prisma.zoneContract.deleteMany({ where: { zoneId: testZoneId } });
    await prisma.zone.deleteMany({ where: { name: `${tag}-zone` } });
    await app.close();
  });

  // ─────────────────────────── 권한 ───────────────────────────

  it('전 엔드포인트가 OPS 전용이다 — 비 OPS 403 · 비로그인 401', async () => {
    const endpoints: [('get' | 'post' | 'patch'), string][] = [
      ['get', '/ops/overview'],
      ['get', '/ops/alerts'],
      ['get', '/ops/fleet'],
      ['get', '/ops/fleet/does-not-matter'],
      ['post', '/ops/fleet/does-not-matter/notes'],
      ['post', '/ops/vehicles'],
      ['get', '/ops/zones'],
      ['patch', '/ops/zones/does-not-matter/contract'],
      ['get', '/ops/users/risk'],
      ['get', '/ops/users/does-not-matter'],
      ['get', '/ops/inquiries'],
      ['post', '/ops/inquiries/does-not-matter/answer'],
      ['get', '/ops/accounting/summary'],
    ];

    for (const [method, path] of endpoints) {
      // 개인 이용자 · 핸들러 모두 막힌다 (권한은 전역 역할로 갈린다)
      await auth(userToken)(request(server())[method](path).send({})).expect(403);
      await auth(handlerToken)(request(server())[method](path).send({})).expect(403);
      await request(server())[method](path).send({}).expect(401);
    }
  });

  it('법인 계정도 운영 API에는 들어오지 못한다', async () => {
    const corpToken = (
      await request(server())
        .post('/auth/login')
        .send({ email: 'admin@demo.mocar.kr', password: 'demo1234' })
        .expect(201)
    ).body.accessToken as string;

    await auth(corpToken)(request(server()).get('/ops/fleet')).expect(403);
    await auth(corpToken)(request(server()).get('/ops/accounting/summary')).expect(403);
  });

  // ─────────────────────── 운영 홈 / 경고 ───────────────────────

  it('운영 홈 스탯: 상태별 대수 합이 전체 차량 수와 같다', async () => {
    const res = await asOps(request(server()).get('/ops/overview')).expect(200);
    const body = res.body as OpsOverviewRes;

    expect(body.idleCount + body.inUseCount + body.inTransitCount + body.maintenanceCount).toBe(
      body.vehicleCount,
    );
    expect(body.vehicleCount).toBeGreaterThan(0);
    expect(body.openInquiryCount).toBeGreaterThanOrEqual(2); // 시드 문의함
    expect(body.alertCount).toBeGreaterThanOrEqual(4);
  });

  it('경고 4종이 시드 데이터로 각 1건 이상 잡힌다', async () => {
    const res = await asOps(request(server()).get('/ops/alerts')).expect(200);
    const alerts = res.body as OpsAlertRes[];

    for (const kind of ['LOW_FUEL', 'INSURANCE_EXPIRING', 'CONTRACT_EXPIRING', 'LATE_RETURN']) {
      expect(alerts.filter((a) => a.kind === kind).length).toBeGreaterThanOrEqual(1);
    }
    // 지연 반납은 심각(danger)이라 맨 위에 온다 — 화면이 정렬을 다시 하지 않아도 되게
    expect(alerts[0].severity).toBe('danger');
    // 항목마다 갈 곳이 정해져 있다 (M3-4의 탭 이동)
    expect(alerts.every((a) => a.tab && a.targetId)).toBe(true);
  });

  // ─────────────────────────── Fleet ───────────────────────────

  it('차량 표: 텔레메트리·보험 D-day·다음 예약이 함께 실리고 상태로 좁힐 수 있다', async () => {
    const all = (await asOps(request(server()).get('/ops/fleet')).expect(200))
      .body as OpsFleetVehicleRes[];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((v) => v.telemetry && typeof v.telemetry.fuelPct === 'number')).toBe(true);
    expect(all.some((v) => v.insurance !== null)).toBe(true);
    expect(all.some((v) => v.lowFuel)).toBe(true); // 시드의 연료 부족 케이스

    const inUse = (await asOps(request(server()).get('/ops/fleet?state=IN_USE')).expect(200))
      .body as OpsFleetVehicleRes[];
    expect(inUse.every((v) => v.state === 'IN_USE')).toBe(true);
    expect(inUse.length).toBeGreaterThanOrEqual(1); // 시드의 지연 반납 진행 중 1건
    expect(inUse[0].nextReservation).not.toBeNull(); // 이용 중이면 그 예약이 '다음 예약'이다

    const maintenance = (await asOps(request(server()).get('/ops/fleet?state=MAINTENANCE')).expect(200))
      .body as OpsFleetVehicleRes[];
    expect(maintenance.every((v) => v.status === 'MAINTENANCE')).toBe(true);

    await asOps(request(server()).get('/ops/fleet?state=NOPE')).expect(400);
  });

  it('차량 상세: 조작 이력 · 도입/보험 · 정비 메모', async () => {
    const list = (await asOps(request(server()).get('/ops/fleet?state=MAINTENANCE')).expect(200))
      .body as OpsFleetVehicleRes[];
    const target = list[0];

    const detail = (await asOps(request(server()).get(`/ops/fleet/${target.id}`)).expect(200))
      .body as OpsFleetDetailRes;
    expect(detail.id).toBe(target.id);
    expect(detail.finance).not.toBeNull();
    expect(detail.finance!.insurerName).toBeTruthy();
    expect(detail.finance!.insuranceDDay).toBe(detail.insurance!.dDay);
    expect(Array.isArray(detail.controlLogs)).toBe(true);
    expect(detail.maintenanceNotes.length).toBeGreaterThanOrEqual(2); // 시드 정비 메모

    await asOps(request(server()).get('/ops/fleet/no-such-vehicle')).expect(404);
  });

  it('정비 메모를 남기면 상세 맨 위에 붙는다', async () => {
    const [vehicle] = (await asOps(request(server()).get('/ops/fleet')).expect(200))
      .body as OpsFleetVehicleRes[];

    const note = (
      await asOps(
        request(server()).post(`/ops/fleet/${vehicle.id}/notes`).send({ body: '워셔액 보충 완료' }),
      ).expect(201)
    ).body as OpsMaintenanceNoteRes;
    expect(note.body).toBe('워셔액 보충 완료');
    expect(note.authorName).toBe('최운영');

    const detail = (await asOps(request(server()).get(`/ops/fleet/${vehicle.id}`)).expect(200))
      .body as OpsFleetDetailRes;
    expect(detail.maintenanceNotes[0].id).toBe(note.id);

    await asOps(request(server()).post(`/ops/fleet/${vehicle.id}/notes`).send({ body: 'x' })).expect(400);
    await prisma.vehicleMaintenanceNote.delete({ where: { id: note.id } });
  });

  it('차량 등록: 차량 + 도입/보험 + 텔레메트리가 함께 태어난다', async () => {
    const payload = {
      modelName: '테스트 등록차',
      plateNo: `${tag.slice(-4)}허 9911`,
      fuel: 'EV',
      seats: 5,
      zoneId: testZoneId,
      planId,
      acquisitionType: 'LEASE',
      monthlyLeaseKrw: 450000,
      insurerName: '모카손해보험',
      insurancePremiumKrw: 52000,
      insuranceExpiresAt: inDays(200).toISOString(),
    };

    const created = (await asOps(request(server()).post('/ops/vehicles').send(payload)).expect(201))
      .body as OpsFleetDetailRes;
    createdVehicleIds.push(created.id);

    expect(created.modelName).toBe('테스트 등록차');
    expect(created.state).toBe('IDLE');
    expect(created.zone.id).toBe(testZoneId);
    expect(created.finance!.acquisitionType).toBe('LEASE');
    expect(created.finance!.monthlyLeaseKrw).toBe(450000);
    // 텔레메트리가 없으면 표에서 그 차만 값이 빈다 — 등록과 함께 만들어져야 한다
    expect(created.telemetry.lat).toBeCloseTo(37.5445, 3);

    // 같은 번호판은 거절, 도입 방식에 맞지 않는 금액도 거절
    await asOps(request(server()).post('/ops/vehicles').send(payload)).expect(409);
    await asOps(
      request(server()).post('/ops/vehicles').send({ ...payload, plateNo: `${tag.slice(-4)}허 9912`, acquisitionType: 'PURCHASE', monthlyLeaseKrw: undefined }),
    ).expect(400);
    await asOps(
      request(server()).post('/ops/vehicles').send({ ...payload, plateNo: `${tag.slice(-4)}허 9913`, zoneId: 'no-such-zone' }),
    ).expect(404);
  });

  // ─────────────────────────── 존 / 계약 ───────────────────────────

  it('존 목록: 잔여 자리 = 면수 − 배정 차량 수', async () => {
    const zones = (await asOps(request(server()).get('/ops/zones')).expect(200)).body as OpsZoneRes[];
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.every((z) => z.freeSlots === z.capacity - z.assignedCount)).toBe(true);
    expect(zones.some((z) => z.contract?.isPaid)).toBe(true);
    expect(zones.some((z) => z.contract && !z.contract.isPaid)).toBe(true);

    // 방금 등록한 차량이 들어간 테스트 존은 자리가 하나 줄어 있다
    const mine = zones.find((z) => z.id === testZoneId)!;
    expect(mine.assignedCount).toBe(createdVehicleIds.length);
    expect(mine.freeSlots).toBe(3 - createdVehicleIds.length);
  });

  it('계약 수정이 목록에 그대로 반영된다 (계약이 없던 존은 새로 만든다)', async () => {
    const contractEnd = inDays(20).toISOString();
    const updated = (
      await asOps(
        request(server()).patch(`/ops/zones/${testZoneId}/contract`).send({
          isPaid: true,
          partnerName: '하이파킹',
          monthlyFeeKrw: 250000,
          contractStart: inDays(-100).toISOString(),
          contractEnd,
        }),
      ).expect(200)
    ).body as OpsZoneRes;

    expect(updated.contract).toMatchObject({
      isPaid: true,
      partnerName: '하이파킹',
      monthlyFeeKrw: 250000,
    });
    expect(updated.contract!.dDay).toBe(20);
    expect(updated.contract!.expiringSoon).toBe(true); // D-30 이내

    const zones = (await asOps(request(server()).get('/ops/zones')).expect(200)).body as OpsZoneRes[];
    expect(zones.find((z) => z.id === testZoneId)!.contract!.monthlyFeeKrw).toBe(250000);

    // 유료인데 0원 · 종료가 시작보다 빠른 계약은 거절
    await asOps(
      request(server()).patch(`/ops/zones/${testZoneId}/contract`).send({ isPaid: true, monthlyFeeKrw: 0 }),
    ).expect(400);
    await asOps(
      request(server()).patch(`/ops/zones/${testZoneId}/contract`).send({
        isPaid: true, monthlyFeeKrw: 100000,
        contractStart: inDays(30).toISOString(), contractEnd: inDays(10).toISOString(),
      }),
    ).expect(400);
    await asOps(
      request(server()).patch('/ops/zones/no-such-zone/contract').send({ isPaid: false, monthlyFeeKrw: 0 }),
    ).expect(404);
  });

  // ─────────────────────────── 유의 유저 ───────────────────────────

  it('유의 유저: 집계값이 실제 이력과 맞고 임계치를 넘은 유저만 나온다', async () => {
    const risky = (await asOps(request(server()).get('/ops/users/risk')).expect(200))
      .body as OpsUserRiskRes[];
    expect(risky.length).toBeGreaterThanOrEqual(1);

    const demo = risky.find((r) => r.email === 'user@demo.mocar.kr')!;
    expect(demo).toBeDefined();

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [lateCount, incidentCount, failCount] = await Promise.all([
      prisma.rental.count({
        where: { reservation: { userId: demo.id }, returnedAt: { gte: since }, lateMinutes: { gt: 0 } },
      }),
      prisma.incidentReport.count({
        where: { rental: { reservation: { userId: demo.id } }, createdAt: { gte: since } },
      }),
      prisma.payment.count({
        where: { reservation: { userId: demo.id }, status: 'FAILED', createdAt: { gte: since } },
      }),
    ]);
    expect(demo.lateReturnCount).toBe(lateCount);
    expect(demo.incidentCount).toBe(incidentCount);
    expect(demo.paymentFailCount).toBe(failCount);
    // 점수는 사고 3 · 결제 거절 2 · 지연 1 가중합
    expect(demo.riskScore).toBe(incidentCount * 3 + failCount * 2 + lateCount);

    // 점수 내림차순
    expect([...risky].sort((a, b) => b.riskScore - a.riskScore).map((r) => r.id)).toEqual(
      risky.map((r) => r.id),
    );
  });

  it('유저 상세: 최근 예약과 사고 이력을 함께 준다', async () => {
    const risky = (await asOps(request(server()).get('/ops/users/risk')).expect(200))
      .body as OpsUserRiskRes[];
    const demo = risky.find((r) => r.email === 'user@demo.mocar.kr')!;

    const detail = (await asOps(request(server()).get(`/ops/users/${demo.id}`)).expect(200))
      .body as OpsUserDetailRes;
    expect(detail.id).toBe(demo.id);
    expect(detail.riskScore).toBe(demo.riskScore);
    expect(detail.recentReservations.length).toBeGreaterThan(0);
    expect(detail.recentIncidents.length).toBeGreaterThanOrEqual(1);

    await asOps(request(server()).get('/ops/users/no-such-user')).expect(404);
  });

  // ─────────────────────────── 문의함 ───────────────────────────

  it('문의 답변: OPEN → ANSWERED, 이용자 문의함에도 그대로 보인다', async () => {
    const open = (await asOps(request(server()).get('/ops/inquiries?status=OPEN')).expect(200))
      .body as OpsInquiryRes[];
    expect(open.length).toBeGreaterThanOrEqual(2);
    expect(open.every((i) => i.status === 'OPEN')).toBe(true);
    expect(open[0].user.email).toBeTruthy(); // 누가 낸 문의인지 함께 온다

    const target = open.find((i) => i.user.email === 'user@demo.mocar.kr')!;
    const answered = (
      await asOps(
        request(server())
          .post(`/ops/inquiries/${target.id}/answer`)
          .send({ answer: '확인했습니다. 해당 차량은 정비 예약을 잡아 두었어요.' }),
      ).expect(201)
    ).body as OpsInquiryRes;

    expect(answered.status).toBe('ANSWERED');
    expect(answered.answeredBy?.name).toBe('최운영');
    expect(answered.answeredAt).toBeTruthy();

    // 교차 확인: 이용자가 자기 문의함에서 같은 답변을 본다
    const mine = (
      await auth(userToken)(request(server()).get('/me/inquiries')).expect(200)
    ).body as InquiryRes[];
    const seen = mine.find((i) => i.id === target.id)!;
    expect(seen.status).toBe('ANSWERED');
    expect(seen.answer).toContain('정비 예약');

    // 같은 문의에 두 번 답하지 않는다 — 이용자가 본 문구와 갈리면 안 된다
    await asOps(
      request(server()).post(`/ops/inquiries/${target.id}/answer`).send({ answer: '다시 답변합니다' }),
    ).expect(409);
    await asOps(
      request(server()).post('/ops/inquiries/no-such/answer').send({ answer: '답변합니다 길게' }),
    ).expect(404);

    // 되돌려 둔다 — 다른 테스트가 OPEN 문의를 기대한다
    await prisma.inquiry.update({
      where: { id: target.id },
      data: { status: 'OPEN', answer: null, answeredAt: null, answeredById: null },
    });
  });

  // ─────────────────────────── 회계 ───────────────────────────

  it('회계 요약: 손익 = 매출 − 비용, 비용은 세 갈래 월 고정비의 합', async () => {
    const res = await asOps(request(server()).get('/ops/accounting/summary?days=30')).expect(200);
    const s = res.body as OpsAccountingSummaryRes;

    expect(s.revenue.totalKrw).toBe(s.revenue.rentalKrw + s.revenue.leaseKrw);
    expect(s.cost.totalKrw).toBe(
      s.cost.vehicleLeaseKrw + s.cost.insuranceKrw + s.cost.zoneContractKrw,
    );
    expect(s.profitKrw).toBe(s.revenue.totalKrw - s.cost.totalKrw);

    // 비용은 DB 합계와 일치한다
    const [finance, zones, leases] = await Promise.all([
      prisma.vehicleFinance.aggregate({ _sum: { monthlyLeaseKrw: true, insurancePremiumKrw: true } }),
      prisma.zoneContract.aggregate({ where: { isPaid: true }, _sum: { monthlyFeeKrw: true } }),
      prisma.leaseContract.aggregate({
        where: { status: { not: 'ENDED' } },
        _sum: { monthlyFeeKrw: true },
      }),
    ]);
    expect(s.cost.vehicleLeaseKrw).toBe(finance._sum.monthlyLeaseKrw ?? 0);
    expect(s.cost.insuranceKrw).toBe(finance._sum.insurancePremiumKrw ?? 0);
    expect(s.cost.zoneContractKrw).toBe(zones._sum.monthlyFeeKrw ?? 0);
    // 법인 리스는 MOCAR 쪽에서는 매출이다 (같은 계약, 반대 방향)
    expect(s.revenue.leaseKrw).toBe(leases._sum.monthlyFeeKrw ?? 0);

    // 기간을 좁히면 이용 매출만 줄고 월 고정비는 그대로다
    const week = (await asOps(request(server()).get('/ops/accounting/summary?days=7')).expect(200))
      .body as OpsAccountingSummaryRes;
    expect(week.cost).toEqual(s.cost);
    expect(week.revenue.rentalKrw).toBeLessThanOrEqual(s.revenue.rentalKrw);

    await asOps(request(server()).get('/ops/accounting/summary?days=0')).expect(400);
  });
});
