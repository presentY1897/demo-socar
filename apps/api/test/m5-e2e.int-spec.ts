/**
 * M5 전 구간 E2E + 권한 매트릭스 전수 (통합).
 *
 * 개별 기능의 경계 조건은 각 스펙(`biz-permissions` · `biz-dispatch` · `biz-fleet-lease` ·
 * `corp-lease`)이 덮는다. 이 스펙이 보는 것은 두 가지다:
 *
 * 1) **매트릭스가 기계적으로 파생되는가** — 엔드포인트 목록을 손으로 적지 않고 Nest 라우트
 *    메타데이터에서 뽑고, 기대값은 shared `CORP_PERMISSIONS`에서 뽑는다. 그래서
 *    - 권한 데코레이터 없이 `/biz` 엔드포인트를 추가하면 → 여기서 터진다
 *    - 등급표를 고치고 가드/화면을 안 고치면 → 여기서 터진다
 *    - 새 엔드포인트를 매트릭스에 안 넣으면 → 여기서 터진다
 *
 * 2) **한 법인이 등급대로 완주하는가** — VIEWER(조회만) → REQUESTER(요청) →
 *    APPROVER(승인) → MANAGER(등급 관리·플릿·리스 연장 요청) → ops(요청 처리)까지
 *    한 동선으로 이어 붙였을 때 실제로 굴러가는지.
 *
 * 시드 계약/계정은 건드리지 않는다 — 이 스위트가 만든 법인·차량·계약 안에서만 상태를 바꾼다.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import 'reflect-metadata';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  CorpGrade,
  CORP_GRADES,
  CORP_PERMISSIONS,
  hasCorpPermission,
  LeaseStatus,
  type CorpPermission,
} from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CORP_PERMISSION_KEY } from '../src/biz/corp-permission.guard';
import { DispatchController } from '../src/biz/dispatch/dispatch.controller';
import { FleetController } from '../src/biz/fleet/fleet.controller';
import { LeasesController } from '../src/biz/fleet/leases.controller';
import { MembersController } from '../src/biz/members/members.controller';
import { runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const PASSWORD = 'demo1234';
const PURPOSE_PREFIX = 'M5E2E';

// ─────────────────────────────────────────────────────────────
// 라우트 열거 — 손으로 적은 목록이 아니라 Nest 메타데이터에서 뽑는다
// ─────────────────────────────────────────────────────────────

interface BizRoute {
  key: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  permissions: CorpPermission[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routesOf(controller: any): BizRoute[] {
  const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
  const classPerms = Reflect.getMetadata(CORP_PERMISSION_KEY, controller) as
    | CorpPermission[]
    | undefined;
  const proto = controller.prototype;

  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name) => Object.getOwnPropertyDescriptor(proto, name)?.value)
    .filter((fn) => typeof fn === 'function' && Reflect.hasMetadata(PATH_METADATA, fn))
    .map((fn) => {
      const sub = (Reflect.getMetadata(PATH_METADATA, fn) as string) ?? '/';
      const verb = RequestMethod[
        Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod
      ] as BizRoute['method'];
      const permissions =
        (Reflect.getMetadata(CORP_PERMISSION_KEY, fn) as CorpPermission[] | undefined) ??
        classPerms ??
        [];
      const path = `/${base}${sub && sub !== '/' ? `/${sub}` : ''}`;
      return { key: `${verb} ${path}`, method: verb, path, permissions };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

const BIZ_ROUTES: BizRoute[] = [
  DispatchController,
  MembersController,
  FleetController,
  LeasesController,
].flatMap(routesOf);

/**
 * 정의만 있고 아직 쓰는 엔드포인트가 없는 권한 — "예약된 권한"(ADR-010).
 * 여기 적힌 것 외에 미사용 권한이 생기면 매트릭스 검사가 실패한다.
 */
const RESERVED_PERMISSIONS: CorpPermission[] = ['manageSettings'];

/**
 * 라우트별 호출 견본. **없는 리소스 id**를 써서 권한이 통과해도 상태가 바뀌지 않게 한다
 * (배차 요청 생성만 예외 — 생성이 곧 동작이라 만들어진 것은 afterAll에서 지운다).
 */
interface Sample {
  url: string;
  body?: Record<string, unknown>;
  /** 권한이 있을 때 나와야 하는 상태 코드 — 400이 섞이면 견본 페이로드가 낡았다는 뜻 */
  allowed: number[];
}

let SAMPLES: Record<string, Sample> = {};

describe('M5 E2E — 권한 매트릭스 전수 + 법인 리스 동선 완주 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const email = (grade: CorpGrade) => `m5e2e-${grade.toLowerCase()}-${stamp}@test.mocar.kr`;
  const token: Record<string, string> = {};

  let corpId: string;
  let zoneId: string;
  let vehicleId: string;
  let leaseId: string;
  const userId: Record<CorpGrade, string> = {} as Record<CorpGrade, string>;

  // 동선을 이어 가며 넘기는 상태
  let requestId: string;
  let approvedReservationId: string | null = null;
  let originalEndAt: Date;
  let requestedEndAt: Date;

  const SLOT_MS = 10 * 60 * 1000;
  const boundary = (offsetMin: number) =>
    new Date(Math.floor(Date.now() / SLOT_MS) * SLOT_MS + SLOT_MS + offsetMin * 60_000);
  const desiredStartAt = boundary(24 * 60).toISOString();
  const desiredEndAt = boundary(24 * 60 + 120).toISOString();
  const boardDate = boundary(24 * 60).toISOString().slice(0, 10);
  const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000);

  const login = async (mail: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: mail, password: PASSWORD })
      .expect(201);
    return res.body.accessToken as string;
  };

  const as = (grade: CorpGrade) => `Bearer ${token[email(grade)]}`;
  const asOps = () => `Bearer ${token['ops@demo.mocar.kr']}`;
  const asPersonal = () => `Bearer ${token['user@demo.mocar.kr']}`;

  /** 견본 호출 — 권한 매트릭스와 컨텍스트 경계 검사가 같은 요청을 쓴다 */
  const call = (route: BizRoute, bearer?: string) => {
    const sample = SAMPLES[route.key];
    const method = route.method.toLowerCase() as 'get' | 'post' | 'patch';
    let req = request(app.getHttpServer())[method](sample.url);
    if (bearer) req = req.set('Authorization', bearer);
    return sample.body ? req.send(sample.body) : req;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    if ((meta?.version ?? 0) < SEED_VERSION) await runSeed(prisma);

    for (const mail of ['ops@demo.mocar.kr', 'user@demo.mocar.kr']) {
      token[mail] = await login(mail);
    }

    // ── 이 스위트 전용 법인 + 전용존 + 리스 차량 1대 ──
    // 오피스를 시드 존에서 멀리 두어 후보가 이 법인의 전용 차량으로 고정되게 한다.
    const plan = await prisma.pricingPlan.findFirstOrThrow();
    const corp = await prisma.corporation.create({
      data: {
        name: `M5E2E상사-${stamp}`,
        officeAddress: '강원 평창군 테스트로 1',
        officeLat: 37.6912,
        officeLng: 128.5945,
      },
    });
    corpId = corp.id;

    const zone = await prisma.zone.create({
      data: {
        name: `M5E2E사옥주차장-${stamp}`,
        region: 'seoul',
        address: corp.officeAddress,
        lat: corp.officeLat,
        lng: corp.officeLng,
        capacity: 3,
        corporationId: corp.id,
      },
    });
    zoneId = zone.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: 'E2E아이오닉',
        plateNo: `77허 ${String(stamp).slice(-4)}`,
        fuel: 'EV',
        seats: 5,
        zoneId: zone.id,
        planId: plan.id,
        corporationId: corp.id,
      },
    });
    vehicleId = vehicle.id;

    originalEndAt = daysFromNow(45);
    const lease = await prisma.leaseContract.create({
      data: {
        corporationId: corp.id,
        vehicleId: vehicle.id,
        monthlyFeeKrw: 820000,
        startAt: daysFromNow(-320),
        endAt: originalEndAt,
        status: LeaseStatus.ACTIVE,
      },
    });
    leaseId = lease.id;

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    for (const grade of CORP_GRADES) {
      const user = await prisma.user.create({
        data: {
          email: email(grade),
          name: `E2E-${grade}`,
          // Role은 전부 임직원(CORP_MEMBER)이다 — 권한이 역할이 아니라 등급에서
          // 나온다는 것을 동선 전체에서 고정하기 위해서.
          role: 'CORP_MEMBER',
          corporationId: corp.id,
          corpGrade: grade,
          passwordHash,
        },
      });
      userId[grade] = user.id;
      token[email(grade)] = await login(email(grade));
    }

    SAMPLES = {
      'POST /biz/dispatch/requests': {
        url: '/biz/dispatch/requests',
        body: { purpose: `${PURPOSE_PREFIX} 매트릭스`, desiredStartAt, desiredEndAt },
        allowed: [201],
      },
      'GET /biz/dispatch/requests': { url: '/biz/dispatch/requests', allowed: [200] },
      'GET /biz/dispatch/requests/:id': {
        url: '/biz/dispatch/requests/no-such-request',
        allowed: [404],
      },
      'POST /biz/dispatch/requests/:id/approve': {
        url: '/biz/dispatch/requests/no-such-request/approve',
        body: { candidateId: 'no-such-candidate' },
        allowed: [404],
      },
      'POST /biz/dispatch/requests/:id/reject': {
        url: '/biz/dispatch/requests/no-such-request/reject',
        body: { reason: '매트릭스 점검' },
        allowed: [404],
      },
      'GET /biz/dispatch/board': { url: `/biz/dispatch/board?date=${boardDate}`, allowed: [200] },
      'GET /biz/members': { url: '/biz/members', allowed: [200] },
      'PATCH /biz/members/:id/grade': {
        url: '/biz/members/no-such-member/grade',
        body: { grade: CorpGrade.REQUESTER },
        allowed: [404],
      },
      'GET /biz/fleet': { url: '/biz/fleet', allowed: [200] },
      'GET /biz/fleet/:id': { url: '/biz/fleet/no-such-vehicle', allowed: [404] },
      'GET /biz/leases': { url: '/biz/leases', allowed: [200] },
      'POST /biz/leases/:id/extend-request': {
        url: '/biz/leases/no-such-lease/extend-request',
        body: { requestedEndAt: daysFromNow(400).toISOString() },
        allowed: [404],
      },
      'POST /biz/leases/:id/terminate-request': {
        url: '/biz/leases/no-such-lease/terminate-request',
        body: { note: '매트릭스 점검' },
        allowed: [404],
      },
    };
  });

  afterAll(async () => {
    const requests = await prisma.dispatchRequest.findMany({
      where: { OR: [{ corporationId: corpId }, { purpose: { startsWith: PURPOSE_PREFIX } }] },
      select: { id: true, reservationId: true },
    });
    const requestIds = requests.map((r) => r.id);
    const reservations = await prisma.reservation.findMany({
      where: {
        OR: [
          { id: { in: requests.map((r) => r.reservationId).filter((id): id is string => !!id) } },
          { vehicleId },
        ],
      },
      select: { id: true },
    });
    const reservationIds = reservations.map((r) => r.id);

    await prisma.dispatchCandidate.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.dispatchRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.payment.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.creditLedger.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.rental.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
    await prisma.leaseContract.deleteMany({ where: { corporationId: corpId } });
    await prisma.vehicle.deleteMany({ where: { corporationId: corpId } });
    await prisma.zone.deleteMany({ where: { id: zoneId } });
    await prisma.user.deleteMany({ where: { corporationId: corpId } });
    await prisma.corporation.deleteMany({ where: { id: corpId } });
    await app.close();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. 매트릭스가 코드에서 기계적으로 파생되는가
  // ═══════════════════════════════════════════════════════════

  describe('권한 매트릭스 — 코드에서 파생', () => {
    it('모든 /biz 엔드포인트가 권한을 선언한다 (데코레이터 누락 방지)', () => {
      expect(BIZ_ROUTES.length).toBeGreaterThan(0);
      const undeclared = BIZ_ROUTES.filter((r) => r.permissions.length === 0).map((r) => r.key);
      expect(undeclared).toEqual([]);
    });

    it('선언된 권한은 모두 shared CORP_PERMISSIONS의 키다', () => {
      const known = Object.keys(CORP_PERMISSIONS[CorpGrade.MANAGER]) as CorpPermission[];
      for (const route of BIZ_ROUTES) {
        for (const permission of route.permissions) {
          expect(known).toContain(permission);
        }
      }
    });

    it('쓰이지 않는 권한은 "예약된 권한"으로만 남아 있다 (manageSettings)', () => {
      const known = Object.keys(CORP_PERMISSIONS[CorpGrade.MANAGER]) as CorpPermission[];
      const used = new Set(BIZ_ROUTES.flatMap((r) => r.permissions));
      const unused = known.filter((p) => !used.has(p));
      expect(unused.sort()).toEqual([...RESERVED_PERMISSIONS].sort());
    });

    it('매트릭스 견본이 실제 라우트 목록과 정확히 일치한다 (새 엔드포인트 누락 방지)', () => {
      expect(Object.keys(SAMPLES).sort()).toEqual(BIZ_ROUTES.map((r) => r.key).sort());
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. 등급 × 엔드포인트 전수 — 기대값은 CORP_PERMISSIONS에서만 나온다
  // ═══════════════════════════════════════════════════════════

  describe('등급 × 엔드포인트 전수', () => {
    const MATRIX = CORP_GRADES.flatMap((grade) =>
      BIZ_ROUTES.map((route) => [`${grade} · ${route.key}`, grade, route] as const),
    );

    it.each(MATRIX)('%s', async (_label, grade, route) => {
      const allowed = route.permissions.every((p) => hasCorpPermission(grade, p));
      const res = await call(route, as(grade));
      if (allowed) {
        // 400이 나오면 견본 페이로드가 계약과 어긋난 것 — 그것도 실패로 본다
        expect(SAMPLES[route.key].allowed).toContain(res.status);
      } else {
        expect(res.status).toBe(403);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. 컨텍스트 경계 — /biz는 법인 등급이 있어야 들어간다
  // ═══════════════════════════════════════════════════════════

  describe('컨텍스트 경계', () => {
    /** 전 라우트를 훑고 어긋난 것만 모아 보여준다 (어느 엔드포인트가 샜는지 바로 보이게) */
    const sweep = async (bearer: string | undefined, expected: number) => {
      const mismatched: string[] = [];
      for (const route of BIZ_ROUTES) {
        const res = await call(route, bearer);
        if (res.status !== expected) mismatched.push(`${route.key} → ${res.status}`);
      }
      return mismatched;
    };

    it('운영 어드민(OPS_ADMIN)은 /biz 전 엔드포인트 403 — 운영 도구는 /ops 소관', async () => {
      expect(await sweep(asOps(), 403)).toEqual([]);
    });

    it('법인 미소속 개인 이용자는 /biz 전 엔드포인트 403', async () => {
      expect(await sweep(asPersonal(), 403)).toEqual([]);
    });

    it('미인증은 /biz 전 엔드포인트 401 — 권한 판정 이전에 인증', async () => {
      expect(await sweep(undefined, 401)).toEqual([]);
    });

    it('법인 MANAGER는 반대편(/ops/leases)에 들어갈 수 없다', async () => {
      await request(app.getHttpServer())
        .get('/ops/leases')
        .set('Authorization', as(CorpGrade.MANAGER))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/ops/leases/${leaseId}/approve`)
        .set('Authorization', as(CorpGrade.MANAGER))
        .send({})
        .expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. 동선 완주 — VIEWER → REQUESTER → APPROVER → MANAGER → ops
  // ═══════════════════════════════════════════════════════════

  describe('동선 완주', () => {
    it('① VIEWER는 배차 현황을 보지만 요청은 만들 수 없다', async () => {
      await request(app.getHttpServer())
        .get('/biz/dispatch/requests')
        .set('Authorization', as(CorpGrade.VIEWER))
        .expect(200);
      await request(app.getHttpServer())
        .post('/biz/dispatch/requests')
        .set('Authorization', as(CorpGrade.VIEWER))
        .send({ purpose: `${PURPOSE_PREFIX} VIEWER 시도`, desiredStartAt, desiredEndAt })
        .expect(403);
    });

    it('② REQUESTER가 요청하면 전용 차량이 후보로 추천된다', async () => {
      const res = await request(app.getHttpServer())
        .post('/biz/dispatch/requests')
        .set('Authorization', as(CorpGrade.REQUESTER))
        .send({ purpose: `${PURPOSE_PREFIX} 워크숍 이동`, desiredStartAt, desiredEndAt })
        .expect(201);

      requestId = res.body.id;
      expect(res.body.status).toBe('RECOMMENDED');
      const dedicated = res.body.candidates.filter((c: { isDedicated: boolean }) => c.isDedicated);
      expect(dedicated.length).toBeGreaterThan(0);
      expect(dedicated[0].vehicle.id).toBe(vehicleId);
    });

    it('③ VIEWER는 남이 낸 요청도 본다 — viewDispatch는 법인 전체 범위다', async () => {
      const list = await request(app.getHttpServer())
        .get('/biz/dispatch/requests')
        .set('Authorization', as(CorpGrade.VIEWER))
        .expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).toContain(requestId);

      const detail = await request(app.getHttpServer())
        .get(`/biz/dispatch/requests/${requestId}`)
        .set('Authorization', as(CorpGrade.VIEWER))
        .expect(200);
      expect(detail.body.requester.id).toBe(userId.REQUESTER);
    });

    it('④ 요청한 본인(REQUESTER)이라도 승인은 못 한다', async () => {
      const detail = await request(app.getHttpServer())
        .get(`/biz/dispatch/requests/${requestId}`)
        .set('Authorization', as(CorpGrade.REQUESTER))
        .expect(200);
      await request(app.getHttpServer())
        .post(`/biz/dispatch/requests/${requestId}/approve`)
        .set('Authorization', as(CorpGrade.REQUESTER))
        .send({ candidateId: detail.body.candidates[0].id })
        .expect(403);
    });

    it('⑤ APPROVER는 Role이 임직원이어도 승인한다 — 권한은 등급에서 나온다', async () => {
      const detail = await request(app.getHttpServer())
        .get(`/biz/dispatch/requests/${requestId}`)
        .set('Authorization', as(CorpGrade.APPROVER))
        .expect(200);
      const candidate = detail.body.candidates.find((c: { isDedicated: boolean }) => c.isDedicated);

      const res = await request(app.getHttpServer())
        .post(`/biz/dispatch/requests/${requestId}/approve`)
        .set('Authorization', as(CorpGrade.APPROVER))
        .send({ candidateId: candidate.id })
        .expect(201);

      expect(res.body.status).toBe('APPROVED');
      expect(res.body.reservationId).toBeTruthy();
      approvedReservationId = res.body.reservationId;

      const approver = await prisma.user.findUniqueOrThrow({ where: { id: userId.APPROVER } });
      expect(approver.role).toBe('CORP_MEMBER');

      // 전용(리스) 차량이라 이용 과금이 없다
      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: approvedReservationId! },
      });
      expect(reservation.totalUpfrontKrw).toBe(0);
      expect(reservation.userId).toBe(userId.REQUESTER); // 예약 명의는 요청자
    });

    it('⑥ APPROVER는 보드까지, 멤버·플릿은 MANAGER부터', async () => {
      const board = await request(app.getHttpServer())
        .get(`/biz/dispatch/board?date=${boardDate}`)
        .set('Authorization', as(CorpGrade.APPROVER))
        .expect(200);
      expect(JSON.stringify(board.body)).toContain(vehicleId);

      await request(app.getHttpServer())
        .get('/biz/members')
        .set('Authorization', as(CorpGrade.APPROVER))
        .expect(403);
      await request(app.getHttpServer())
        .get('/biz/fleet')
        .set('Authorization', as(CorpGrade.APPROVER))
        .expect(403);
    });

    it('⑦ MANAGER가 VIEWER를 승격하면 옛 토큰 그대로 즉시 반영된다', async () => {
      const members = await request(app.getHttpServer())
        .get('/biz/members')
        .set('Authorization', as(CorpGrade.MANAGER))
        .expect(200);
      expect(members.body).toHaveLength(CORP_GRADES.length);

      await request(app.getHttpServer())
        .patch(`/biz/members/${userId.VIEWER}/grade`)
        .set('Authorization', as(CorpGrade.MANAGER))
        .send({ grade: CorpGrade.REQUESTER })
        .expect(200);

      // 토큰 재발급 없이 — 가드가 DB에서 등급을 다시 읽는다
      const created = await request(app.getHttpServer())
        .post('/biz/dispatch/requests')
        .set('Authorization', as(CorpGrade.VIEWER))
        .send({ purpose: `${PURPOSE_PREFIX} 승격 후`, desiredStartAt, desiredEndAt })
        .expect(201);
      expect(created.body.status).toBe('RECOMMENDED');

      // 강등도 같은 자리에서 즉시 반영된다
      await request(app.getHttpServer())
        .patch(`/biz/members/${userId.VIEWER}/grade`)
        .set('Authorization', as(CorpGrade.MANAGER))
        .send({ grade: CorpGrade.VIEWER })
        .expect(200);
      await request(app.getHttpServer())
        .post('/biz/dispatch/requests')
        .set('Authorization', as(CorpGrade.VIEWER))
        .send({ purpose: `${PURPOSE_PREFIX} 강등 후`, desiredStartAt, desiredEndAt })
        .expect(403);
    });

    it('⑧ MANAGER는 플릿에서 리스 만기·월 비용·이용 실적을 함께 본다', async () => {
      const res = await request(app.getHttpServer())
        .get('/biz/fleet')
        .set('Authorization', as(CorpGrade.MANAGER))
        .expect(200);

      const item = res.body.items.find((i: { id: string }) => i.id === vehicleId);
      expect(item).toBeTruthy();
      expect(item.lease.monthlyFeeKrw).toBe(820000);
      expect(item.lease.status).toBe(LeaseStatus.ACTIVE);
      expect(res.body.summary.monthlyTotalKrw).toBe(820000);
      expect(res.body.summary.activeLeaseCount).toBe(1);
      expect(item.lease.dDay).toBeGreaterThan(40);
      expect(item.lease.expiringSoon).toBe(false);
      expect(item.usage).toHaveProperty('utilizationPct');
    });

    it('⑨ MANAGER가 연장을 요청하면 계약은 "처리 대기"까지만 간다', async () => {
      requestedEndAt = daysFromNow(410);
      const res = await request(app.getHttpServer())
        .post(`/biz/leases/${leaseId}/extend-request`)
        .set('Authorization', as(CorpGrade.MANAGER))
        .send({ requestedEndAt: requestedEndAt.toISOString(), note: '내년 프로젝트 연장' })
        .expect(201);

      expect(res.body.status).toBe(LeaseStatus.EXTENSION_REQUESTED);
      expect(res.body.requestedBy.id).toBe(userId.MANAGER);

      // 법인은 만기를 스스로 옮기지 못한다 — endAt은 그대로다
      const stored = await prisma.leaseContract.findUniqueOrThrow({ where: { id: leaseId } });
      expect(stored.endAt.toISOString()).toBe(originalEndAt.toISOString());

      // 처리 대기 중 재요청은 409
      await request(app.getHttpServer())
        .post(`/biz/leases/${leaseId}/terminate-request`)
        .set('Authorization', as(CorpGrade.MANAGER))
        .send({ note: '중복 요청' })
        .expect(409);
    });

    it('⑩ 운영 어드민이 승인하면 만기가 옮겨지고 계약이 다시 진행 중이 된다', async () => {
      const list = await request(app.getHttpServer())
        .get('/ops/leases?status=EXTENSION_REQUESTED')
        .set('Authorization', asOps())
        .expect(200);
      expect(list.body.map((l: { id: string }) => l.id)).toContain(leaseId);

      const res = await request(app.getHttpServer())
        .post(`/ops/leases/${leaseId}/approve`)
        .set('Authorization', asOps())
        .send({ note: '연장 승인' })
        .expect(201);
      expect(res.body.status).toBe(LeaseStatus.ACTIVE);
      expect(new Date(res.body.endAt).toISOString()).toBe(requestedEndAt.toISOString());

      // 같은 결정을 다시 내리면 409
      await request(app.getHttpServer())
        .post(`/ops/leases/${leaseId}/approve`)
        .set('Authorization', asOps())
        .send({})
        .expect(409);
    });

    it('⑪ 법인 화면에도 연장 결과가 그대로 보인다', async () => {
      const res = await request(app.getHttpServer())
        .get('/biz/leases')
        .set('Authorization', as(CorpGrade.MANAGER))
        .expect(200);

      const lease = res.body.find((l: { id: string }) => l.id === leaseId);
      expect(lease.status).toBe(LeaseStatus.ACTIVE);
      expect(new Date(lease.endAt).toISOString()).toBe(requestedEndAt.toISOString());
      expect(lease.dDay).toBeGreaterThan(400 - 2);
      expect(lease.expiringSoon).toBe(false);
    });

    it('⑫ 해지도 같은 경로 — 요청은 법인, 종료는 운영. 종료된 계약엔 재요청 불가', async () => {
      await request(app.getHttpServer())
        .post(`/biz/leases/${leaseId}/terminate-request`)
        .set('Authorization', as(CorpGrade.MANAGER))
        .send({ note: '프로젝트 종료' })
        .expect(201);

      const approved = await request(app.getHttpServer())
        .post(`/ops/leases/${leaseId}/approve`)
        .set('Authorization', asOps())
        .send({})
        .expect(201);
      expect(approved.body.status).toBe(LeaseStatus.ENDED);
      expect(approved.body.endedAt).toBeTruthy();

      await request(app.getHttpServer())
        .post(`/biz/leases/${leaseId}/extend-request`)
        .set('Authorization', as(CorpGrade.MANAGER))
        .send({ requestedEndAt: daysFromNow(500).toISOString() })
        .expect(409);
    });
  });
});
