/**
 * 법인 등급 + 리스 계약 도메인 통합 테스트 (M5-1).
 * - 마이그레이션/시드 후 기존 계정의 등급 매핑
 * - 전용 차량(= 법인 리스 차량)의 ACTIVE 리스 계약 백필 결과
 * - viewer 데모 계정 로그인
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CorpGrade, CORP_PERMISSIONS, hasCorpPermission } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const DEMO_CORP = '주식회사 데모컴퍼니';

describe('법인 등급 + 리스 계약 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let corporationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // 데모 시드가 없거나 구버전이면 이 스위트가 필요한 상태를 직접 만든다
    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    if ((meta?.version ?? 0) < SEED_VERSION) await runSeed(prisma);

    const corp = await prisma.corporation.findFirstOrThrow({ where: { name: DEMO_CORP } });
    corporationId = corp.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('법인 계정에 등급이 부여된다 (CORP_MEMBER→REQUESTER, CORP_ADMIN→MANAGER)', async () => {
    const members = await prisma.user.findMany({ where: { corporationId } });
    const byEmail = new Map(members.map((m) => [m.email, m]));

    expect(byEmail.get('member@demo.mocar.kr')?.corpGrade).toBe(CorpGrade.REQUESTER);
    expect(byEmail.get('admin@demo.mocar.kr')?.corpGrade).toBe(CorpGrade.MANAGER);
    // 법인 소속이면 등급이 반드시 있다
    expect(members.every((m) => m.corpGrade !== null)).toBe(true);
  });

  it('법인 미소속 계정(개인/운영)은 등급이 없다', async () => {
    const outsiders = await prisma.user.findMany({
      where: { email: { in: ['user@demo.mocar.kr', 'ops@demo.mocar.kr'] } },
    });
    expect(outsiders).toHaveLength(2);
    expect(outsiders.every((u) => u.corporationId === null && u.corpGrade === null)).toBe(true);
  });

  it('전용 차량마다 진행 중(ACTIVE) 리스 계약이 존재한다', async () => {
    const dedicated = await prisma.vehicle.findMany({
      where: { corporationId },
      include: { leaseContracts: true },
    });
    expect(dedicated.length).toBeGreaterThan(0);

    for (const vehicle of dedicated) {
      const active = vehicle.leaseContracts.filter((l) => l.status === 'ACTIVE');
      expect(active).toHaveLength(1); // 진행 중 계약은 차량당 1건
      expect(active[0].corporationId).toBe(corporationId);
      expect(active[0].monthlyFeeKrw).toBeGreaterThan(0);
      expect(active[0].endAt.getTime()).toBeGreaterThan(active[0].startAt.getTime());
    }
  });

  it('만기 임박(D-60 이내) 리스 계약이 최소 1건 있다', async () => {
    const soon = new Date(Date.now() + 60 * 24 * 3600 * 1000);
    const expiring = await prisma.leaseContract.findMany({
      where: { corporationId, status: 'ACTIVE', endAt: { lte: soon } },
    });
    expect(expiring.length).toBeGreaterThanOrEqual(1);
  });

  it('viewer 데모 계정으로 로그인할 수 있고 등급은 VIEWER다', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'viewer@demo.mocar.kr', password: 'demo1234' })
      .expect(201);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.corporationId).toBe(corporationId);

    const viewer = await prisma.user.findUniqueOrThrow({
      where: { email: 'viewer@demo.mocar.kr' },
    });
    expect(viewer.corpGrade).toBe(CorpGrade.VIEWER);
    // 권한 판정은 shared 상수 단일 소스 — VIEWER는 조회만
    expect(hasCorpPermission(viewer.corpGrade, 'viewDispatch')).toBe(true);
    expect(hasCorpPermission(viewer.corpGrade, 'createRequest')).toBe(false);
  });

  it('DB 등급 enum과 shared 권한 매핑의 등급 목록이 일치한다', () => {
    const grades = Object.keys(CORP_PERMISSIONS).sort();
    expect(grades).toEqual(['APPROVER', 'MANAGER', 'REQUESTER', 'VIEWER']);
  });
});
