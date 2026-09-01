/**
 * 법인 플릿 / 리스 연장·해지 워크플로 통합 테스트 (M5-5).
 *
 * 상태 전이는 두 컨텍스트가 나눠 만든다 — biz는 요청(*_REQUESTED)까지, ops는 결정
 * (ACTIVE/ENDED)까지. 그 경계와 권한(manageFleet)·테넌시를 함께 고정한다.
 *
 * 시드 계약을 건드리면 다른 스위트(corp-lease)의 전제가 깨지므로, 상태를 바꾸는 검증은
 * 이 스위트가 직접 만든 법인·차량·계약에서만 한다.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { CorpGrade, CORP_GRADES, hasCorpPermission, LeaseStatus } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const PASSWORD = 'demo1234';
const DEMO_CORP = '주식회사 데모컴퍼니';

/** 등급별 시드 계정 */
const ACCOUNT_BY_GRADE: Record<CorpGrade, string> = {
  VIEWER: 'viewer@demo.mocar.kr',
  REQUESTER: 'member@demo.mocar.kr',
  APPROVER: 'approver@demo.mocar.kr',
  MANAGER: 'admin@demo.mocar.kr',
};

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000);

describe('법인 플릿 · 리스 워크플로 (/biz/fleet · /ops/leases, 통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};

  // 이 스위트 전용 법인 — 시드 계약을 건드리지 않으려고 따로 만든다
  const stamp = Date.now();
  const managerEmail = `fleet-mgr-${stamp}@test.mocar.kr`;
  let testCorpId: string;
  let testZoneId: string;
  let vehicleAId: string;
  let vehicleBId: string;
  let leaseAId: string;
  let leaseBId: string;
  let endedLeaseId: string;
  let managerId: string;

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    return res.body.accessToken as string;
  };

  const auth = (email: string) => `Bearer ${token[email]}`;
  const asGrade = (grade: CorpGrade) => auth(ACCOUNT_BY_GRADE[grade]);
  const asManager = () => auth(managerEmail);
  const asOps = () => auth('ops@demo.mocar.kr');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    if ((meta?.version ?? 0) < SEED_VERSION) await runSeed(prisma);

    for (const email of [...Object.values(ACCOUNT_BY_GRADE), 'ops@demo.mocar.kr']) {
      token[email] = await login(email);
    }

    // ── 테스트 전용 법인 + 전용존 + 리스 차량 2대 ──
    const plan = await prisma.pricingPlan.findFirstOrThrow();
    const corp = await prisma.corporation.create({
      data: {
        name: `플릿테스트-${stamp}`,
        officeAddress: '서울 성동구 테스트로 1',
        officeLat: 37.545,
        officeLng: 127.056,
      },
    });
    testCorpId = corp.id;

    const zone = await prisma.zone.create({
      data: {
        name: `플릿테스트존-${stamp}`,
        region: 'seoul',
        address: corp.officeAddress,
        lat: corp.officeLat,
        lng: corp.officeLng,
        capacity: 2,
        corporationId: corp.id,
      },
    });
    testZoneId = zone.id;

    const manager = await prisma.user.create({
      data: {
        email: managerEmail,
        name: '플릿관리자',
        role: 'CORP_ADMIN',
        corporationId: corp.id,
        corpGrade: CorpGrade.MANAGER,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
    managerId = manager.id;
    token[managerEmail] = await login(managerEmail);

    const [vehicleA, vehicleB] = await Promise.all([
      prisma.vehicle.create({
        data: {
          modelName: 'A테스트카',
          plateNo: `99가 ${String(stamp).slice(-4)}`,
          fuel: 'EV',
          seats: 5,
          zoneId: zone.id,
          planId: plan.id,
          corporationId: corp.id,
        },
      }),
      prisma.vehicle.create({
        data: {
          modelName: 'B테스트밴',
          plateNo: `99나 ${String(stamp).slice(-4)}`,
          fuel: 'GASOLINE',
          seats: 7,
          zoneId: zone.id,
          planId: plan.id,
          corporationId: corp.id,
        },
      }),
    ]);
    vehicleAId = vehicleA.id;
    vehicleBId = vehicleB.id;

    const [leaseA, leaseB, ended] = await Promise.all([
      prisma.leaseContract.create({
        data: {
          corporationId: corp.id,
          vehicleId: vehicleA.id,
          monthlyFeeKrw: 700000,
          startAt: daysFromNow(-180),
          endAt: daysFromNow(20), // 만기 임박(D-20) 케이스
          status: LeaseStatus.ACTIVE,
        },
      }),
      prisma.leaseContract.create({
        data: {
          corporationId: corp.id,
          vehicleId: vehicleB.id,
          monthlyFeeKrw: 900000,
          startAt: daysFromNow(-90),
          endAt: daysFromNow(300),
          status: LeaseStatus.ACTIVE,
        },
      }),
      // 계약 이력(종료된 과거 계약)
      prisma.leaseContract.create({
        data: {
          corporationId: corp.id,
          vehicleId: vehicleA.id,
          monthlyFeeKrw: 650000,
          startAt: daysFromNow(-540),
          endAt: daysFromNow(-180),
          endedAt: daysFromNow(-180),
          status: LeaseStatus.ENDED,
        },
      }),
    ]);
    leaseAId = leaseA.id;
    leaseBId = leaseB.id;
    endedLeaseId = ended.id;

    // 운행일지 = 예약 + 대여 (최근 30일 안에 2일, 총 5시간)
    for (const [day, hours, km] of [
      [3, 2, 24.5],
      [10, 3, 60],
    ] as const) {
      const startAt = new Date(daysFromNow(-day).setHours(10, 0, 0, 0));
      const endAt = new Date(startAt.getTime() + hours * 3600 * 1000);
      await prisma.reservation.create({
        data: {
          userId: manager.id,
          vehicleId: vehicleA.id,
          startAt,
          endAt,
          status: 'COMPLETED',
          insurance: 'STANDARD',
          rentalFeeKrw: 0,
          insuranceFeeKrw: 0,
          totalUpfrontKrw: 0,
          rental: {
            create: {
              status: 'COMPLETED',
              startedAt: startAt,
              returnedAt: endAt,
              distanceKm: km,
              lateMinutes: 0,
              driveFeeKrw: 0,
              lateFeeKrw: 0,
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    const reservations = await prisma.reservation.findMany({
      where: { vehicleId: { in: [vehicleAId, vehicleBId] } },
      select: { id: true },
    });
    const reservationIds = reservations.map((r) => r.id);
    await prisma.rental.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
    await prisma.leaseContract.deleteMany({ where: { corporationId: testCorpId } });
    await prisma.vehicle.deleteMany({ where: { corporationId: testCorpId } });
    await prisma.zone.deleteMany({ where: { id: testZoneId } });
    await prisma.user.deleteMany({ where: { corporationId: testCorpId } });
    await prisma.corporation.deleteMany({ where: { id: testCorpId } });
    await app.close();
  });

  // ── 권한 (manageFleet) ────────────────────────────────────
  it.each(CORP_GRADES)('%s — 플릿·리스 조회는 manageFleet 권한대로 허용/403', async (grade) => {
    const allowed = hasCorpPermission(grade, 'manageFleet');
    for (const path of ['/biz/fleet', '/biz/leases']) {
      const res = await request(app.getHttpServer()).get(path).set('Authorization', asGrade(grade));
      expect(res.status).toBe(allowed ? 200 : 403);
    }
  });

  it.each(CORP_GRADES)('%s — 연장·해지 요청은 manageFleet 권한대로 허용/403', async (grade) => {
    const allowed = hasCorpPermission(grade, 'manageFleet');
    for (const action of ['extend-request', 'terminate-request']) {
      const res = await request(app.getHttpServer())
        .post(`/biz/leases/no-such-lease/${action}`)
        .set('Authorization', asGrade(grade))
        .send({ requestedEndAt: daysFromNow(400).toISOString(), note: '테스트' });
      // 권한이 없으면 계약 존재 여부와 무관하게 가드에서 403,
      // 있으면 가드를 지나 서비스 판정(없는 계약 → 404)까지 간다
      expect(res.status).toBe(allowed ? 404 : 403);
    }
  });

  it('법인 계정은 운영 어드민 리스 처리(/ops/leases)에 접근할 수 없다', async () => {
    await request(app.getHttpServer())
      .get('/ops/leases')
      .set('Authorization', asManager())
      .expect(403);
    await request(app.getHttpServer())
      .post(`/ops/leases/${leaseAId}/approve`)
      .set('Authorization', asGrade(CorpGrade.MANAGER))
      .send({})
      .expect(403);
  });

  it('운영 어드민은 법인 플릿(/biz/fleet)에 접근할 수 없다 (등급이 없다)', async () => {
    await request(app.getHttpServer()).get('/biz/fleet').set('Authorization', asOps()).expect(403);
  });

  // ── 테넌시 ────────────────────────────────────────────────
  it('다른 법인의 차량·리스는 만질 수 없다', async () => {
    // 시드 법인의 MANAGER가 이 스위트의 계약을 건드리려 하면 403
    await request(app.getHttpServer())
      .get(`/biz/fleet/${vehicleAId}`)
      .set('Authorization', asGrade(CorpGrade.MANAGER))
      .expect(403);
    await request(app.getHttpServer())
      .post(`/biz/leases/${leaseAId}/extend-request`)
      .set('Authorization', asGrade(CorpGrade.MANAGER))
      .send({ requestedEndAt: daysFromNow(400).toISOString() })
      .expect(403);

    // 목록에도 남의 법인 차량은 섞이지 않는다
    const res = await request(app.getHttpServer())
      .get('/biz/fleet')
      .set('Authorization', asGrade(CorpGrade.MANAGER))
      .expect(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).not.toContain(vehicleAId);
  });

  // ── 플릿 목록/상세 ────────────────────────────────────────
  it('시드 법인 MANAGER는 전용 차량의 계약·만기 D-day·이용률을 함께 본다', async () => {
    const res = await request(app.getHttpServer())
      .get('/biz/fleet')
      .set('Authorization', asGrade(CorpGrade.MANAGER))
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.zone.name).toBeTruthy();
      expect(item.lease.monthlyFeeKrw).toBeGreaterThan(0);
      expect(typeof item.lease.dDay).toBe('number');
      expect(item.usage.windowDays).toBe(30);
      expect(item.usage.utilizationPct).toBeGreaterThanOrEqual(0);
    }
    // 합계는 진행 중 계약의 월 리스료 합
    const sum = res.body.items.reduce(
      (acc: number, i: { lease: { monthlyFeeKrw: number } }) => acc + i.lease.monthlyFeeKrw,
      0,
    );
    expect(res.body.summary.monthlyTotalKrw).toBe(sum);
    expect(res.body.summary.vehicleCount).toBe(res.body.items.length);
    // 시드에 만기 임박(D-24) 계약이 1건 있다
    expect(res.body.summary.expiringSoonCount).toBeGreaterThanOrEqual(1);
  });

  it('차량 상세는 계약 이력·운행일지·이용 임직원 통계를 준다', async () => {
    const res = await request(app.getHttpServer())
      .get(`/biz/fleet/${vehicleAId}`)
      .set('Authorization', asManager())
      .expect(200);

    expect(res.body.id).toBe(vehicleAId);
    expect(res.body.lease.id).toBe(leaseAId);
    expect(res.body.lease.expiringSoon).toBe(true); // D-20
    // 종료된 과거 계약도 이력에 남는다
    expect(res.body.contracts.map((c: { id: string }) => c.id)).toEqual(
      expect.arrayContaining([leaseAId, endedLeaseId]),
    );

    // 운행일지 2건 = 이용일 2일 / 30일 → 6.7%
    expect(res.body.trips).toHaveLength(2);
    expect(res.body.usage).toMatchObject({ tripCount: 2, usedDays: 2, totalHours: 5 });
    expect(res.body.usage.utilizationPct).toBeCloseTo(6.7, 1);
    expect(res.body.usage.distanceKm).toBeCloseTo(84.5, 1);
    expect(res.body.memberUsage).toEqual([
      expect.objectContaining({ id: managerId, tripCount: 2, totalHours: 5 }),
    ]);
  });

  // ── 연장: 요청 → 승인 ─────────────────────────────────────
  it('연장 요청은 계약을 처리 대기로 올리고 요청자를 남긴다', async () => {
    const requestedEndAt = daysFromNow(400);
    const res = await request(app.getHttpServer())
      .post(`/biz/leases/${leaseAId}/extend-request`)
      .set('Authorization', asManager())
      .send({ requestedEndAt: requestedEndAt.toISOString(), note: '내년까지 계속 씁니다' })
      .expect(201);

    expect(res.body.status).toBe(LeaseStatus.EXTENSION_REQUESTED);
    expect(res.body.requestedBy).toMatchObject({ id: managerId });
    expect(new Date(res.body.requestedEndAt).getTime()).toBe(requestedEndAt.getTime());
    expect(res.body.requestNote).toBe('내년까지 계속 씁니다');
    // 만기는 아직 그대로 — 결정 전에는 계약이 바뀌지 않는다
    expect(new Date(res.body.endAt).getTime()).toBeLessThan(requestedEndAt.getTime());
  });

  it('처리 대기 중에 또 요청하면 409', async () => {
    await request(app.getHttpServer())
      .post(`/biz/leases/${leaseAId}/extend-request`)
      .set('Authorization', asManager())
      .send({ requestedEndAt: daysFromNow(500).toISOString() })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/biz/leases/${leaseAId}/terminate-request`)
      .set('Authorization', asManager())
      .send({})
      .expect(409);
  });

  it('운영 어드민 목록에는 처리 대기 건이 먼저 온다', async () => {
    const res = await request(app.getHttpServer())
      .get('/ops/leases')
      .set('Authorization', asOps())
      .expect(200);

    const pendingIndex = res.body.findIndex((l: { id: string }) => l.id === leaseAId);
    expect(pendingIndex).toBeGreaterThanOrEqual(0);
    const target = res.body[pendingIndex];
    expect(target.corporation.name).toContain('플릿테스트');
    expect(target.vehicle.plateNo).toBeTruthy();
    // 자기 뒤에 오는 건 중에 처리 대기가 남아 있으면 안 된다
    const after = res.body.slice(pendingIndex + 1);
    expect(after.every((l: { status: string }) => l.status === 'ACTIVE' || l.status === 'ENDED')).toBe(
      true,
    );

    const filtered = await request(app.getHttpServer())
      .get('/ops/leases?status=EXTENSION_REQUESTED')
      .set('Authorization', asOps())
      .expect(200);
    expect(filtered.body.every((l: { status: string }) => l.status === 'EXTENSION_REQUESTED')).toBe(
      true,
    );
  });

  it('운영 어드민이 승인하면 만기가 희망 만기로 옮겨지고 계약 중으로 돌아온다', async () => {
    const before = await prisma.leaseContract.findUniqueOrThrow({ where: { id: leaseAId } });
    const res = await request(app.getHttpServer())
      .post(`/ops/leases/${leaseAId}/approve`)
      .set('Authorization', asOps())
      .send({ note: '연장 승인' })
      .expect(201);

    expect(res.body.status).toBe(LeaseStatus.ACTIVE);
    expect(new Date(res.body.endAt).getTime()).toBe(before.requestedEndAt!.getTime());
    expect(res.body.requestedEndAt).toBeNull();
    // 요청 흔적(누가·언제)은 남는다
    expect(res.body.requestedBy).toMatchObject({ id: managerId });
  });

  it('이미 처리된 요청을 다시 처리하면 409', async () => {
    await request(app.getHttpServer())
      .post(`/ops/leases/${leaseAId}/approve`)
      .set('Authorization', asOps())
      .send({})
      .expect(409);
    await request(app.getHttpServer())
      .post(`/ops/leases/${leaseAId}/reject`)
      .set('Authorization', asOps())
      .send({ reason: '중복 처리' })
      .expect(409);
  });

  it('희망 만기가 현재 만기보다 이르면 400', async () => {
    await request(app.getHttpServer())
      .post(`/biz/leases/${leaseAId}/extend-request`)
      .set('Authorization', asManager())
      .send({ requestedEndAt: daysFromNow(1).toISOString() })
      .expect(400);
  });

  // ── 반려 ──────────────────────────────────────────────────
  it('반려하면 계약 중으로 되돌아가고 사유가 메모로 남는다', async () => {
    await request(app.getHttpServer())
      .post(`/biz/leases/${leaseAId}/extend-request`)
      .set('Authorization', asManager())
      .send({ requestedEndAt: daysFromNow(800).toISOString() })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/ops/leases/${leaseAId}/reject`)
      .set('Authorization', asOps())
      .send({ reason: '차량 재고 회수 예정' })
      .expect(201);

    expect(res.body.status).toBe(LeaseStatus.ACTIVE);
    expect(res.body.requestedEndAt).toBeNull();
    expect(res.body.requestNote).toContain('차량 재고 회수 예정');
    // 반려 사유가 없으면 400
    await request(app.getHttpServer())
      .post(`/ops/leases/${leaseAId}/reject`)
      .set('Authorization', asOps())
      .send({})
      .expect(400);
  });

  // ── 해지: 요청 → 승인 → 종료 ──────────────────────────────
  it('해지 요청을 승인하면 계약이 종료되고 종료 시각이 찍힌다', async () => {
    const requested = await request(app.getHttpServer())
      .post(`/biz/leases/${leaseBId}/terminate-request`)
      .set('Authorization', asManager())
      .send({ note: '차량 반납합니다' })
      .expect(201);
    expect(requested.body.status).toBe(LeaseStatus.TERMINATION_REQUESTED);

    const approved = await request(app.getHttpServer())
      .post(`/ops/leases/${leaseBId}/approve`)
      .set('Authorization', asOps())
      .send({})
      .expect(201);

    expect(approved.body.status).toBe(LeaseStatus.ENDED);
    expect(approved.body.endedAt).toBeTruthy();
    expect(approved.body.expiringSoon).toBe(false); // 끝난 계약은 만기 강조 대상이 아니다
  });

  it('종료된 계약에는 다시 요청할 수 없다 (409)', async () => {
    await request(app.getHttpServer())
      .post(`/biz/leases/${leaseBId}/extend-request`)
      .set('Authorization', asManager())
      .send({ requestedEndAt: daysFromNow(900).toISOString() })
      .expect(409);
  });

  it('계약이 끝난 차량은 플릿 합계에서 빠진다', async () => {
    const res = await request(app.getHttpServer())
      .get('/biz/fleet')
      .set('Authorization', asManager())
      .expect(200);

    expect(res.body.summary.vehicleCount).toBe(2);
    expect(res.body.summary.activeLeaseCount).toBe(1); // B는 해지 완료
    expect(res.body.summary.monthlyTotalKrw).toBe(700000);
    const ended = res.body.items.find((i: { id: string }) => i.id === vehicleBId);
    expect(ended.lease).toBeNull();
  });
});
