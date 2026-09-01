/**
 * 법인 등급 권한 매트릭스 + 등급 관리 API 통합 테스트 (M5-3).
 *
 * 등급 4종 × biz 엔드포인트별 허용/403을 전수로 확인한다. 기대값은 테스트가 따로 적지 않고
 * shared `CORP_PERMISSIONS`에서 끌어온다 — 상수와 가드가 갈라지면 여기서 터진다.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  CorpGrade,
  CORP_GRADES,
  hasCorpPermission,
  type CorpPermission,
} from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const PASSWORD = 'demo1234';
const DEMO_CORP = '주식회사 데모컴퍼니';

/** 등급별 데모 계정 — 시드가 4종을 모두 제공한다 */
const ACCOUNT_BY_GRADE: Record<CorpGrade, string> = {
  VIEWER: 'viewer@demo.mocar.kr',
  REQUESTER: 'member@demo.mocar.kr',
  APPROVER: 'approver@demo.mocar.kr',
  MANAGER: 'admin@demo.mocar.kr',
};

const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const desiredStartAt = `${tomorrow}T14:00:00+09:00`;
const desiredEndAt = `${tomorrow}T16:00:00+09:00`;

describe('법인 등급 권한 매트릭스 (/biz, 통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};
  const createdRequestIds: string[] = [];

  // 등급 변경 대상 — 시드 계정을 건드리지 않도록 이 스위트 전용 멤버를 만든다
  const targetEmail = `perm-target-${Date.now()}@test.mocar.kr`;
  const otherCorpEmail = `perm-other-${Date.now()}@test.mocar.kr`;
  let targetId: string;
  let otherCorpUserId: string;
  let otherCorpId: string;

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    return res.body.accessToken as string;
  };

  const auth = (grade: CorpGrade) => `Bearer ${token[ACCOUNT_BY_GRADE[grade]]}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    if ((meta?.version ?? 0) < SEED_VERSION) await runSeed(prisma);

    for (const email of [...Object.values(ACCOUNT_BY_GRADE), 'user@demo.mocar.kr', 'ops@demo.mocar.kr']) {
      token[email] = await login(email);
    }

    const corp = await prisma.corporation.findFirstOrThrow({ where: { name: DEMO_CORP } });
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const target = await prisma.user.create({
      data: {
        email: targetEmail, name: '등급변경대상', role: 'CORP_MEMBER',
        corporationId: corp.id, corpGrade: 'VIEWER', passwordHash,
      },
    });
    targetId = target.id;

    const otherCorp = await prisma.corporation.create({
      data: {
        name: `perm-test-corp-${Date.now()}`, officeAddress: '테스트',
        officeLat: 37.5, officeLng: 127.0,
      },
    });
    otherCorpId = otherCorp.id;
    const outsider = await prisma.user.create({
      data: {
        email: otherCorpEmail, name: '타법인멤버', role: 'CORP_MEMBER',
        corporationId: otherCorp.id, corpGrade: 'REQUESTER', passwordHash,
      },
    });
    otherCorpUserId = outsider.id;
  });

  afterAll(async () => {
    // 이 스위트가 만든 요청 = 추적한 id + 매트릭스가 만든 것(목적 접두사) + 테스트 계정이 만든 것
    const created = await prisma.dispatchRequest.findMany({
      where: {
        OR: [
          { id: { in: createdRequestIds } },
          { purpose: { startsWith: '매트릭스' } },
          { purpose: { startsWith: '승격' } },
          { requesterId: targetId },
        ],
      },
      select: { id: true, reservationId: true },
    });
    const requestIds = created.map((r) => r.id);
    const reservationIds = created.map((r) => r.reservationId).filter((id): id is string => !!id);
    await prisma.dispatchCandidate.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.dispatchRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.payment.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.creditLedger.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
    await prisma.user.deleteMany({ where: { email: { in: [targetEmail, otherCorpEmail] } } });
    await prisma.corporation.deleteMany({ where: { id: otherCorpId } });
    await app.close();
  });

  const createRequest = async (grade: CorpGrade, purpose: string, start = desiredStartAt, end = desiredEndAt) => {
    const res = await request(app.getHttpServer())
      .post('/biz/dispatch/requests')
      .set('Authorization', auth(grade))
      .send({ purpose, desiredStartAt: start, desiredEndAt: end })
      .expect(201);
    createdRequestIds.push(res.body.id);
    return res.body;
  };

  /** 권한이 있으면 403이 아니고, 없으면 403이어야 한다 */
  const expectByPermission = async (
    grade: CorpGrade,
    permission: CorpPermission,
    call: () => request.Test,
  ) => {
    const res = await call();
    if (hasCorpPermission(grade, permission)) {
      expect(res.status).not.toBe(403);
    } else {
      expect(res.status).toBe(403);
    }
  };

  // ── 배차: 요청 생성 (createRequest) ───────────────────────
  it.each(CORP_GRADES)('%s — 배차 요청 생성은 createRequest 권한대로 허용/403', async (grade) => {
    await expectByPermission(grade, 'createRequest', () =>
      request(app.getHttpServer())
        .post('/biz/dispatch/requests')
        .set('Authorization', auth(grade))
        .send({ purpose: `매트릭스 ${grade}`, desiredStartAt, desiredEndAt }),
    );
  });

  // ── 배차: 목록/상세 (viewDispatch) ────────────────────────
  it.each(CORP_GRADES)('%s — 배차 목록·상세는 viewDispatch 권한대로 허용/403', async (grade) => {
    const seed = await createRequest(CorpGrade.REQUESTER, '매트릭스 조회 대상');

    await expectByPermission(grade, 'viewDispatch', () =>
      request(app.getHttpServer()).get('/biz/dispatch/requests').set('Authorization', auth(grade)),
    );
    await expectByPermission(grade, 'viewDispatch', () =>
      request(app.getHttpServer())
        .get(`/biz/dispatch/requests/${seed.id}`)
        .set('Authorization', auth(grade)),
    );
  });

  // ── 배차: 승인/반려 (approve) ─────────────────────────────
  it.each(CORP_GRADES)('%s — 승인/반려는 approve 권한대로 허용/403', async (grade) => {
    // 권한이 없으면 요청 존재 여부와 무관하게 가드에서 403,
    // 권한이 있으면 가드를 통과해 서비스 판정(없는 요청 → 404)까지 간다
    await expectByPermission(grade, 'approve', () =>
      request(app.getHttpServer())
        .post('/biz/dispatch/requests/no-such-request/approve')
        .set('Authorization', auth(grade))
        .send({ candidateId: 'x' }),
    );
    await expectByPermission(grade, 'approve', () =>
      request(app.getHttpServer())
        .post('/biz/dispatch/requests/no-such-request/reject')
        .set('Authorization', auth(grade))
        .send({ reason: '테스트' }),
    );
  });

  // ── 배차: 보드 (viewBoard) ────────────────────────────────
  it.each(CORP_GRADES)('%s — 타임라인 보드는 viewBoard 권한대로 허용/403', async (grade) => {
    await expectByPermission(grade, 'viewBoard', () =>
      request(app.getHttpServer())
        .get(`/biz/dispatch/board?date=${tomorrow}`)
        .set('Authorization', auth(grade)),
    );
  });

  // ── 멤버 관리 (manageMembers) ─────────────────────────────
  it.each(CORP_GRADES)('%s — 멤버 목록·등급 변경은 manageMembers 권한대로 허용/403', async (grade) => {
    await expectByPermission(grade, 'manageMembers', () =>
      request(app.getHttpServer()).get('/biz/members').set('Authorization', auth(grade)),
    );
    await expectByPermission(grade, 'manageMembers', () =>
      request(app.getHttpServer())
        .patch(`/biz/members/${targetId}/grade`)
        .set('Authorization', auth(grade))
        .send({ grade: CorpGrade.REQUESTER }),
    );
  });

  it('APPROVER 등급이면 Role이 임직원이어도 실제로 승인할 수 있다', async () => {
    const created = await createRequest(
      CorpGrade.REQUESTER,
      '매트릭스 승인',
      `${tomorrow}T09:00:00+09:00`,
      `${tomorrow}T11:00:00+09:00`,
    );
    expect(created.candidates.length).toBeGreaterThan(0);

    const res = await request(app.getHttpServer())
      .post(`/biz/dispatch/requests/${created.id}/approve`)
      .set('Authorization', auth(CorpGrade.APPROVER))
      .send({ candidateId: created.candidates[0].id })
      .expect(201);

    expect(res.body.status).toBe('APPROVED');
    const approver = await prisma.user.findUniqueOrThrow({
      where: { email: ACCOUNT_BY_GRADE.APPROVER },
    });
    expect(approver.role).toBe('CORP_MEMBER'); // 역할이 아니라 등급이 권한의 근거
  });

  it('법인 미소속(개인·운영 어드민)은 biz 전 구간 403', async () => {
    for (const email of ['user@demo.mocar.kr', 'ops@demo.mocar.kr']) {
      const bearer = `Bearer ${token[email]}`;
      await request(app.getHttpServer())
        .get('/biz/dispatch/requests')
        .set('Authorization', bearer)
        .expect(403);
      await request(app.getHttpServer())
        .get('/biz/members')
        .set('Authorization', bearer)
        .expect(403);
    }
  });

  it('MANAGER는 멤버 목록을 등급과 함께 본다 (본인 표시 포함)', async () => {
    const res = await request(app.getHttpServer())
      .get('/biz/members')
      .set('Authorization', auth(CorpGrade.MANAGER))
      .expect(200);

    const emails = res.body.map((m: { email: string }) => m.email);
    expect(emails).toEqual(expect.arrayContaining(Object.values(ACCOUNT_BY_GRADE)));
    expect(res.body.every((m: { corpGrade: string }) => !!m.corpGrade)).toBe(true);
    expect(res.body.filter((m: { isSelf: boolean }) => m.isSelf)).toHaveLength(1);
    // 다른 법인 멤버는 섞이지 않는다
    expect(emails).not.toContain(otherCorpEmail);
  });

  it('MANAGER가 등급을 올리면 즉시 반영된다 (토큰 재발급 없이)', async () => {
    // 앞선 매트릭스 테스트가 이 계정의 등급을 바꿨을 수 있어 시작 상태를 고정한다
    await prisma.user.update({ where: { id: targetId }, data: { corpGrade: 'VIEWER' } });
    const before = await login(targetEmail);
    // 승격 전에는 요청 생성 불가 (VIEWER)
    await request(app.getHttpServer())
      .post('/biz/dispatch/requests')
      .set('Authorization', `Bearer ${before}`)
      .send({ purpose: '승격 전', desiredStartAt, desiredEndAt })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/biz/members/${targetId}/grade`)
      .set('Authorization', auth(CorpGrade.MANAGER))
      .send({ grade: CorpGrade.REQUESTER })
      .expect(200);

    // 같은 토큰 그대로 — 가드가 DB에서 등급을 다시 읽으므로 바로 통과한다
    const after = await request(app.getHttpServer())
      .post('/biz/dispatch/requests')
      .set('Authorization', `Bearer ${before}`)
      .send({ purpose: '승격 후', desiredStartAt, desiredEndAt })
      .expect(201);
    createdRequestIds.push(after.body.id);

    // /auth/me도 최신 등급을 돌려준다
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${before}`)
      .expect(200);
    expect(me.body.corpGrade).toBe(CorpGrade.REQUESTER);
  });

  it('자기 자신은 강등할 수 없다 (법인에 MANAGER가 0명이 되는 것 방지)', async () => {
    const manager = await prisma.user.findUniqueOrThrow({
      where: { email: ACCOUNT_BY_GRADE.MANAGER },
    });
    const res = await request(app.getHttpServer())
      .patch(`/biz/members/${manager.id}/grade`)
      .set('Authorization', auth(CorpGrade.MANAGER))
      .send({ grade: CorpGrade.VIEWER })
      .expect(400);
    expect(res.body.message).toContain('본인 등급은 낮출 수 없습니다');

    const still = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });
    expect(still.corpGrade).toBe(CorpGrade.MANAGER);
  });

  it('다른 법인 멤버의 등급은 변경할 수 없다', async () => {
    await request(app.getHttpServer())
      .patch(`/biz/members/${otherCorpUserId}/grade`)
      .set('Authorization', auth(CorpGrade.MANAGER))
      .send({ grade: CorpGrade.MANAGER })
      .expect(403);

    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: otherCorpUserId } });
    expect(untouched.corpGrade).toBe(CorpGrade.REQUESTER);
  });

  it('알 수 없는 등급 값은 400', async () => {
    await request(app.getHttpServer())
      .patch(`/biz/members/${targetId}/grade`)
      .set('Authorization', auth(CorpGrade.MANAGER))
      .send({ grade: 'SUPERUSER' })
      .expect(400);
  });
});
