/**
 * 운영 백오피스 도메인 통합 테스트 (M3-1).
 * - 마이그레이션/시드 후 전 차량·전 존에 텔레메트리 / 도입·보험 / 존 계약이 붙는지
 * - 경고 피드(M3-3)가 시드만으로 4종을 보여줄 수 있는지 (연료 부족·보험 만기·계약 만료·지연 반납)
 * - Vehicle.doorLocked/engineOn 이관 결과 (스마트키 상태는 텔레메트리 한 곳에만 있다)
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 + 시드 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CORP_ZONE_NAME, loadZoneDefs, runSeed, SEED_VERSION } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

/** 경고 임계치 — M3-3 `/ops/alerts`가 쓰는 값과 같아야 한다 */
const LOW_FUEL_PCT = 20;
const EXPIRING_DAYS = 30;

const inDays = (days: number) => new Date(Date.now() + days * 24 * 3600 * 1000);

describe('운영 백오피스 도메인 (통합)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  /**
   * 같은 DB에서 다른 스위트의 픽스처(존·차량)가 함께 산다.
   * "전 차량·전 존에 붙었나"는 시드가 만든 것에 한해 따진다 — 픽스처까지 세면
   * 이 스위트가 다른 스위트의 정리 상태에 끌려다니게 된다.
   */
  let seedZoneNames: Set<string>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // 데모 시드가 없거나 구버전이면 이 스위트가 필요한 상태를 직접 만든다
    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    if ((meta?.version ?? 0) < SEED_VERSION) await runSeed(prisma);

    seedZoneNames = new Set([...loadZoneDefs().map((z) => z.name), CORP_ZONE_NAME]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('시드 차량은 모두 텔레메트리와 도입/보험 정보를 갖는다', async () => {
    const vehicles = (
      await prisma.vehicle.findMany({ include: { telemetry: true, finance: true, zone: true } })
    ).filter((v) => seedZoneNames.has(v.zone.name));
    expect(vehicles.length).toBeGreaterThan(0);

    const withoutTelemetry = vehicles.filter((v) => v.telemetry === null);
    const withoutFinance = vehicles.filter((v) => v.finance === null);
    expect(withoutTelemetry).toHaveLength(0);
    expect(withoutFinance).toHaveLength(0);

    // 연료는 % 단위 — EV는 배터리 잔량이라는 뜻이지만 표현은 하나다
    expect(vehicles.every((v) => v.telemetry!.fuelPct >= 0 && v.telemetry!.fuelPct <= 100)).toBe(true);
    // 도입 방식별로 금액이 한쪽만 채워진다 (구매=취득가 / 리스=월 리스료)
    for (const v of vehicles) {
      const f = v.finance!;
      if (f.acquisitionType === 'PURCHASE') {
        expect(f.acquisitionCostKrw).toBeGreaterThan(0);
        expect(f.monthlyLeaseKrw).toBeNull();
      } else {
        expect(f.monthlyLeaseKrw).toBeGreaterThan(0);
        expect(f.acquisitionCostKrw).toBeNull();
      }
      expect(f.insurancePremiumKrw).toBeGreaterThan(0);
    }
  });

  it('시드 존은 모두 계약 정보를 갖고, 유·무료가 섞여 있다', async () => {
    const zones = (await prisma.zone.findMany({ include: { contract: true } })).filter((z) =>
      seedZoneNames.has(z.name),
    );
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.filter((z) => z.contract === null)).toHaveLength(0);

    const paid = zones.filter((z) => z.contract!.isPaid);
    const free = zones.filter((z) => !z.contract!.isPaid);
    expect(paid.length).toBeGreaterThan(0);
    expect(free.length).toBeGreaterThan(0);
    // 유료 존은 파트너·월 비용·계약 기간이 함께 있고, 무료 존은 비용이 0이다
    expect(paid.every((z) => z.contract!.partnerName !== null && z.contract!.monthlyFeeKrw > 0)).toBe(true);
    expect(free.every((z) => z.contract!.monthlyFeeKrw === 0)).toBe(true);
  });

  it('경고 데모 케이스 4종이 시드에 들어 있다', async () => {
    // ① 연료 부족
    const lowFuel = await prisma.vehicleTelemetry.count({ where: { fuelPct: { lt: LOW_FUEL_PCT } } });
    expect(lowFuel).toBeGreaterThanOrEqual(1);

    // ② 보험 만기 임박 (D-30 이내, 이미 지난 건 제외)
    const insuranceSoon = await prisma.vehicleFinance.count({
      where: { insuranceExpiresAt: { gte: new Date(), lte: inDays(EXPIRING_DAYS) } },
    });
    expect(insuranceSoon).toBeGreaterThanOrEqual(1);

    // ③ 존 계약 만료 임박
    const contractSoon = await prisma.zoneContract.count({
      where: { contractEnd: { gte: new Date(), lte: inDays(EXPIRING_DAYS) } },
    });
    expect(contractSoon).toBeGreaterThanOrEqual(1);

    // ④ 지연 반납 진행 중 — 반납 예정 시각이 지났는데 아직 이용 중
    const lateNow = await prisma.rental.count({
      where: { status: 'IN_USE', reservation: { endAt: { lt: new Date() } } },
    });
    expect(lateNow).toBeGreaterThanOrEqual(1);
  });

  it('고객 탭 데모 데이터: 지연 반납·사고 접수·결제 거절이 한 계정에 모여 있다', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'user@demo.mocar.kr' } });
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const lateReturns = await prisma.rental.count({
      where: { reservation: { userId: user.id }, returnedAt: { gte: since }, lateMinutes: { gt: 0 } },
    });
    const incidents = await prisma.incidentReport.count({
      where: { rental: { reservation: { userId: user.id } } },
    });
    const payFails = await prisma.payment.count({
      where: { reservation: { userId: user.id }, status: 'FAILED' },
    });

    expect(lateReturns).toBeGreaterThanOrEqual(3);
    expect(incidents).toBeGreaterThanOrEqual(1);
    expect(payFails).toBeGreaterThanOrEqual(2);
  });

  it('문의함 데모 데이터: 답변 대기와 답변 완료가 함께 있다', async () => {
    const open = await prisma.inquiry.count({ where: { status: 'OPEN' } });
    const answered = await prisma.inquiry.findFirst({ where: { status: 'ANSWERED' } });
    expect(open).toBeGreaterThanOrEqual(2);
    expect(answered?.answer).toBeTruthy();
    expect(answered?.answeredById).toBeTruthy(); // 누가 답했는지 남는다
  });

  it('스마트키 상태는 텔레메트리 한 곳에만 있다 (Vehicle 임시 필드 제거 확인)', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'Vehicle'
    `;
    const names = columns.map((c) => c.column_name);
    expect(names).not.toContain('doorLocked');
    expect(names).not.toContain('engineOn');

    // 이관된 자리에는 값이 있다 — 차는 잠긴 채 서 있는 게 기본
    const parked = await prisma.vehicleTelemetry.count({ where: { doorLocked: true } });
    expect(parked).toBeGreaterThan(0);
  });
});
