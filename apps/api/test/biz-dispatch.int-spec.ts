/**
 * biz 컨텍스트 배차 통합 테스트 (M5-2).
 * `/dispatch/*` → `/biz/dispatch/*`로 옮긴 엔드포인트의 전건 회귀 + 구 경로 폐기 확인.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const DEMO_CORP = '주식회사 데모컴퍼니';
const PASSWORD = 'demo1234';

/** 내일 14:00~16:00 (KST) — 과거 시각 검증에 걸리지 않게 */
const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const desiredStartAt = `${tomorrow}T14:00:00+09:00`;
const desiredEndAt = `${tomorrow}T16:00:00+09:00`;

describe('biz 배차 (/biz/dispatch, 통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let memberToken: string;
  let adminToken: string;
  let personalToken: string;
  const createdRequestIds: string[] = [];

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    if ((meta?.version ?? 0) < SEED_VERSION) await runSeed(prisma);

    [memberToken, adminToken, personalToken] = await Promise.all([
      login('member@demo.mocar.kr'),
      login('admin@demo.mocar.kr'),
      login('user@demo.mocar.kr'),
    ]);
  });

  afterAll(async () => {
    // 이 스위트가 만든 요청/예약만 정리 (시드 데이터는 그대로 둔다)
    const created = await prisma.dispatchRequest.findMany({
      where: { id: { in: createdRequestIds } },
      select: { id: true, reservationId: true },
    });
    const reservationIds = created.map((r) => r.reservationId).filter((id): id is string => !!id);
    await prisma.dispatchCandidate.deleteMany({ where: { requestId: { in: createdRequestIds } } });
    await prisma.dispatchRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    await prisma.payment.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.creditLedger.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
    await app.close();
  });

  const createRequest = async (token: string, purpose: string) => {
    const res = await request(app.getHttpServer())
      .post('/biz/dispatch/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose, desiredStartAt, desiredEndAt })
      .expect(201);
    createdRequestIds.push(res.body.id);
    return res.body;
  };

  it('임직원이 /biz/dispatch/requests 로 요청하면 추천까지 완료된다', async () => {
    const body = await createRequest(memberToken, '통합테스트 — 거래처 미팅');

    expect(body.status).toBe('RECOMMENDED');
    expect(Array.isArray(body.candidates)).toBe(true);
    expect(body.candidates.length).toBeGreaterThan(0);
    // 추천 근거가 함께 내려온다
    expect(body.candidates[0].reasons.length).toBeGreaterThan(0);
    expect(body.candidates[0].vehicle.zone).toBeTruthy();
  });

  it('목록·상세를 새 경로에서 조회할 수 있다', async () => {
    const created = await createRequest(memberToken, '통합테스트 — 조회');

    const list = await request(app.getHttpServer())
      .get('/biz/dispatch/requests')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(list.body.some((r: { id: string }) => r.id === created.id)).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/biz/dispatch/requests/${created.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(detail.body.purpose).toBe('통합테스트 — 조회');
  });

  it('배차 담당자가 후보를 승인하면 예약이 생성된다', async () => {
    const created = await createRequest(memberToken, '통합테스트 — 승인');
    const candidateId = created.candidates[0].id;

    const approved = await request(app.getHttpServer())
      .post(`/biz/dispatch/requests/${created.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ candidateId })
      .expect(201);

    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.reservationId).toBeTruthy();
    expect(approved.body.reservation.status).toBe('CONFIRMED');
  });

  it('배차 담당자가 반려하면 사유가 기록된다', async () => {
    const created = await createRequest(memberToken, '통합테스트 — 반려');

    const rejected = await request(app.getHttpServer())
      .post(`/biz/dispatch/requests/${created.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '해당 시간대 차량 부족' })
      .expect(201);

    expect(rejected.body.status).toBe('REJECTED');
    expect(rejected.body.rejectReason).toBe('해당 시간대 차량 부족');
  });

  it('타임라인 보드를 새 경로에서 조회한다', async () => {
    const res = await request(app.getHttpServer())
      .get(`/biz/dispatch/board?date=${tomorrow}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.date).toBe(tomorrow);
    expect(res.body.office.name).toBe(DEMO_CORP);
    expect(Array.isArray(res.body.vehicles)).toBe(true);
  });

  it('법인 미소속(개인) 계정은 배차 요청이 403', async () => {
    await request(app.getHttpServer())
      .post('/biz/dispatch/requests')
      .set('Authorization', `Bearer ${personalToken}`)
      .send({ purpose: '개인 요청', desiredStartAt, desiredEndAt })
      .expect(403);
  });

  it('임직원은 타임라인 보드가 403', async () => {
    await request(app.getHttpServer())
      .get(`/biz/dispatch/board?date=${tomorrow}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  it('구 경로 /dispatch/* 는 더 이상 존재하지 않는다', async () => {
    await request(app.getHttpServer())
      .get('/dispatch/requests')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(404);
  });
});
