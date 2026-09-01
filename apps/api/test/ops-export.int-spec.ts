/**
 * Export 통합 테스트 (M4-4) — `?format=csv|json` 5곳.
 *
 * 확인하는 것은 넷이다: ① 형식을 안 주면 기존 응답 그대로 ② CSV의 BOM·헤더·이스케이프
 * ③ 화면에 걸린 필터가 파일에도 걸리는가 ④ 남의 데이터가 새지 않는가(권한).
 * 이스케이프는 쉼표·따옴표·개행을 **실제로 심어** 확인한다 — 규칙만 단위 테스트하면
 * 그 값이 정말 그 열로 나가는지는 아무도 안 본다.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { OpsFleetVehicleRes, ReportResponseRes } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

const BOM = '﻿';

/** 따옴표 안의 쉼표·개행을 존중하며 CSV를 되읽는다 (RFC 4180) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe('Export (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let opsToken: string;
  let userToken: string;
  let otherUserToken: string;

  const tag = `export-${Date.now()}`;
  /** 쉼표·따옴표·개행이 모두 든 값 — CSV가 무너지는 세 가지를 한 번에 심는다 */
  const NASTY = '앞유리 "긁힘", 확인 필요\n2줄째 메모';
  let zoneId: string;
  let vehicleId: string;
  let taskId: string;

  const server = () => app.getHttpServer();
  const auth = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const asOps = (r: request.Test) => auth(opsToken)(r);

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
    [opsToken, userToken, otherUserToken] = await Promise.all([
      login('ops@demo.mocar.kr'),
      login('user@demo.mocar.kr'),
      login('handler@demo.mocar.kr'),
    ]);

    const plan = await prisma.pricingPlan.findFirstOrThrow();
    // 존 이름에 쉼표를 심는다 — 차량 CSV의 "배정 존" 열이 밀리는지 본다
    const zone = await prisma.zone.create({
      data: {
        name: `${tag}, 지하 2층`,
        region: 'seoul',
        address: '테스트',
        lat: 37.5,
        lng: 127.0,
        capacity: 2,
      },
    });
    zoneId = zone.id;
    const otherZone = await prisma.zone.create({
      data: {
        name: `${tag}-to`,
        region: 'seoul',
        address: '테스트',
        lat: 37.51,
        lng: 127.01,
        capacity: 2,
      },
    });

    vehicleId = (
      await prisma.vehicle.create({
        data: {
          modelName: `${tag}-차종`,
          plateNo: `${tag}-1`,
          fuel: 'EV',
          seats: 5,
          zoneId: zone.id,
          planId: plan.id,
          status: 'MAINTENANCE',
        },
      })
    ).id;

    taskId = (
      await prisma.handlerTask.create({
        data: {
          type: 'REPOSITION',
          status: 'DONE',
          vehicleId,
          fromZoneId: zone.id,
          toZoneId: otherZone.id,
          dueAt: new Date('2026-08-10T07:00:00Z'),
          completedAt: new Date('2026-08-10T06:00:00Z'),
          completionNote: NASTY,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.handlerTask.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: { startsWith: tag } } });
    await app.close();
  });

  /** CSV를 받아 헤더·행으로 되읽는다 (BOM 검증 포함) */
  const getCsv = async (path: string) => {
    const res = await asOps(request(server()).get(path)).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-type']).toContain('charset=utf-8');
    expect(res.headers['content-disposition']).toContain('attachment;');
    expect(res.text.startsWith(BOM)).toBe(true);
    const [headers, ...rows] = parseCsv(res.text.slice(1));
    return { headers, rows, disposition: res.headers['content-disposition'] as string, res };
  };

  // ─────────────────────────── 기본 계약 ───────────────────────────

  it('format을 안 주면 기존 JSON 응답 그대로다 (다운로드 헤더도 없다)', async () => {
    for (const path of ['/ops/fleet', '/ops/tasks', '/ops/users/risk', '/ops/reports?metric=revenue&groupBy=day']) {
      const res = await asOps(request(server()).get(path)).expect(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toBeUndefined();
    }
  });

  it('알 수 없는 format은 조용히 무시하지 않고 400', async () => {
    await asOps(request(server()).get('/ops/fleet?format=xlsx')).expect(400);
    await asOps(request(server()).get('/ops/users/risk?format=pdf')).expect(400);
  });

  it('내려받기도 OPS 전용이다 — 비 OPS 403 · 비로그인 401', async () => {
    const paths = [
      '/ops/fleet?format=csv',
      '/ops/tasks?format=csv',
      '/ops/users/risk?format=csv',
      '/ops/reports?metric=revenue&groupBy=day&format=csv',
    ];
    for (const path of paths) {
      await auth(userToken)(request(server()).get(path)).expect(403);
      await request(server()).get(path).expect(401);
    }
  });

  // ─────────────────────────── 차량 표 ───────────────────────────

  it('차량 CSV: 중첩(텔레메트리·보험·다음 예약)이 열로 펴지고 쉼표가 든 존 이름도 한 칸에 머문다', async () => {
    const { headers, rows } = await getCsv(`/ops/fleet?zoneId=${zoneId}&format=csv`);

    expect(headers).toContain('연료·배터리(%)');
    expect(headers).toContain('주행거리(km)');
    expect(headers).toContain('보험 만기');
    // 중첩 객체가 자동 평탄화되지 않는다 (사람이 읽는 헤더만)
    expect(headers.some((h) => h.includes('.'))).toBe(false);

    expect(rows).toHaveLength(1);
    const row = Object.fromEntries(headers.map((h, i) => [h, rows[0][i]]));
    expect(row['배정 존']).toBe(`${tag}, 지하 2층`); // 쉼표가 열을 밀지 않았다
    expect(row['차종']).toBe(`${tag}-차종`);
    expect(row['연료']).toBe('전기차');
    expect(row['운행 가능']).toBe('정비 중');
    expect(row['보험사']).toBe(''); // 도입/보험 정보가 없는 차 → 빈 칸
  });

  it('차량 표: 필터와 정렬이 파일에도 그대로 걸린다 (화면에서 본 순서 그대로)', async () => {
    const sorted = await asOps(
      request(server()).get('/ops/fleet?sort=plateNo&dir=desc'),
    ).expect(200);
    const expected = (sorted.body as OpsFleetVehicleRes[]).map((v) => v.plateNo);

    const { headers, rows } = await getCsv('/ops/fleet?sort=plateNo&dir=desc&format=csv');
    const plateNoAt = headers.indexOf('차량 번호');
    expect(rows.map((r) => r[plateNoAt])).toEqual(expected);

    // 상태 필터를 걸면 그 상태만 나가고 파일명에도 남는다
    const maintenance = await getCsv('/ops/fleet?state=MAINTENANCE&format=csv');
    const stateAt = maintenance.headers.indexOf('상태');
    expect(new Set(maintenance.rows.map((r) => r[stateAt]))).toEqual(new Set(['정비']));
    expect(maintenance.disposition).toContain(encodeURIComponent('차량목록_정비'));
  });

  // ─────────────────────────── 작업 목록 ───────────────────────────

  it('작업 CSV: 따옴표·쉼표·개행이 든 인계 메모가 한 칸에 담긴다', async () => {
    const { headers, rows } = await getCsv('/ops/tasks?status=DONE&format=csv');

    const noteAt = headers.indexOf('인계 메모');
    const mine = rows.find((r) => r[headers.indexOf('차량 번호')] === `${tag}-1`);
    expect(mine).toBeDefined();
    expect(mine![noteAt]).toBe(NASTY); // 원본 그대로 되읽힌다
    expect(mine![headers.indexOf('상태')]).toBe('완료');

    // 상태 필터가 실제로 반영된다
    expect(new Set(rows.map((r) => r[headers.indexOf('상태')]))).toEqual(new Set(['완료']));
  });

  it('작업 JSON: 목록 응답을 그대로 파일로 낸다', async () => {
    const res = await asOps(request(server()).get('/ops/tasks?format=json')).expect(200);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment;');
    const rows = JSON.parse(res.text) as { id: string }[];
    expect(rows.some((t) => t.id === taskId)).toBe(true);
  });

  // ─────────────────────────── 유의 유저 ───────────────────────────

  it('유의 유저 CSV: 화면이 감춘 위험 점수까지 싣는다 (정렬 근거를 재현할 수 있게)', async () => {
    const { headers, rows } = await getCsv('/ops/users/risk?format=csv');

    expect(headers).toEqual([
      '이름',
      '이메일',
      '지연 반납(회)',
      '사고 접수(회)',
      '결제 거절(회)',
      '위험 점수',
      '마지막 지연 반납',
    ]);
    const json = await asOps(request(server()).get('/ops/users/risk')).expect(200);
    expect(rows).toHaveLength((json.body as unknown[]).length);
  });

  // ─────────────────────────── 리포트 ───────────────────────────

  it('리포트 CSV: 헤더에 단위가 붙고 값은 숫자 그대로 (엑셀이 합계를 잡게)', async () => {
    const { headers, rows, disposition } = await getCsv(
      '/ops/reports?metric=revenue&groupBy=day&from=2026-08-01&to=2026-08-03&format=csv',
    );

    expect(headers).toEqual(['일자별', '매출(원)']);
    expect(rows).toHaveLength(3); // 빠진 날도 0으로 채워져 나간다
    expect(rows[0][0]).toBe('2026-08-01');
    expect(rows.every((r) => /^\d+(\.\d+)?$/.test(r[1]))).toBe(true); // "120,000원"이 아니다
    expect(disposition).toContain(encodeURIComponent('리포트_매출_일자별_2026-08-01_2026-08-03'));
  });

  it('리포트 JSON: meta까지 통째로 — 파일만 보고도 무슨 조건인지 안다', async () => {
    const res = await asOps(
      request(server()).get(
        `/ops/reports?metric=utilization&groupBy=zone&from=2026-08-01&to=2026-08-03&zoneId=${zoneId}&format=json`,
      ),
    ).expect(200);

    const body = JSON.parse(res.text) as ReportResponseRes;
    expect(body.meta).toMatchObject({
      metric: 'utilization',
      groupBy: 'zone',
      unit: 'pct',
      range: { from: '2026-08-01', to: '2026-08-03' },
      filters: { zoneId, model: null },
    });
  });

  it('리포트 필터가 파일 내용에도 걸린다', async () => {
    const all = await getCsv('/ops/reports?metric=zoneOccupancy&groupBy=zone&format=csv');
    const one = await getCsv(`/ops/reports?metric=zoneOccupancy&groupBy=zone&zoneId=${zoneId}&format=csv`);

    expect(one.rows).toHaveLength(1);
    expect(one.rows[0][0]).toBe(`${tag}, 지하 2층`);
    expect(all.rows.length).toBeGreaterThan(one.rows.length);
    // 기간에 반응하지 않는 지표라 파일명에 기간을 적지 않는다
    expect(one.disposition).not.toContain('2026-08-01');
  });

  it('리포트 Export도 허용되지 않는 조합은 400이다 (파일이라고 검증을 건너뛰지 않는다)', async () => {
    await asOps(
      request(server()).get('/ops/reports?metric=zoneOccupancy&groupBy=day&format=csv'),
    ).expect(400);
  });

  // ─────────────────────────── 내 예약 ───────────────────────────

  it('내 예약 CSV: 로그인한 사람의 예약만, 수령 방식까지 사람 말로', async () => {
    const res = await auth(userToken)(
      request(server()).get('/reservations/mine?format=csv'),
    ).expect(200);
    expect(res.text.startsWith(BOM)).toBe(true);

    const [headers, ...rows] = parseCsv(res.text.slice(1));
    expect(headers).toContain('수령 방식');
    expect(headers).toContain('선결제 합계(원)');

    const mine = await auth(userToken)(request(server()).get('/reservations/mine')).expect(200);
    expect(rows).toHaveLength((mine.body as unknown[]).length);
    expect(new Set(rows.map((r) => r[headers.indexOf('수령 방식')]))).toEqual(
      new Set(
        (mine.body as { deliveryLabel: string | null; returnZoneId: string | null }[]).map((r) =>
          r.deliveryLabel ? `부름 (${r.deliveryLabel})` : r.returnZoneId ? '편도' : '왕복',
        ),
      ),
    );
  });

  it('내 예약 Export는 남의 예약을 섞지 않는다', async () => {
    const mine = await auth(userToken)(request(server()).get('/reservations/mine?format=json')).expect(200);
    const other = await auth(otherUserToken)(
      request(server()).get('/reservations/mine?format=json'),
    ).expect(200);

    const ids = (rows: string) => (JSON.parse(rows) as { id: string }[]).map((r) => r.id);
    expect(ids(mine.text).some((id) => ids(other.text).includes(id))).toBe(false);

    // 비로그인은 아예 못 받는다
    await request(server()).get('/reservations/mine?format=csv').expect(401);
  });
});
