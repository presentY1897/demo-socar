/**
 * 사진 저장/조회 공통 경로(M1-2) 통합 테스트 — 압축 사진이 DB를 왕복해도 그대로 돌아오는가.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PHOTO_MAX_BYTES, PHOTO_MIME, photosSchema } from '@socar/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { toPhotoRows, toStoredPhotos, totalPhotoBytes } from '../src/photos/photo-storage';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

/** 압축 상한(200KB)에 딱 맞는 사진 — text 컬럼이 실제 용량을 견디는지도 함께 본다 */
const bigPhoto = { mime: PHOTO_MIME, data: Buffer.alloc(PHOTO_MAX_BYTES, 3).toString('base64') };
const smallPhoto = { mime: PHOTO_MIME, data: Buffer.alloc(4096, 9).toString('base64') };

describe('사진 파이프라인 (통합) — 저장 → 조회', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rentalId: string;
  let vehicleId: string;
  const tag = `photo-${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: tag, baseHourlyKrw: 6000, weekendHourlyKrw: 7500, perKmKrw: 200,
        insuranceLightKrw: 700, insuranceStandardKrw: 1400, insuranceFullKrw: 2200,
      },
    });
    const zone = await prisma.zone.create({
      data: { name: tag, region: 'seoul', address: '테스트', lat: 37.5, lng: 127.03, capacity: 1 },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '테스트카PH', plateNo: `93테${Date.now() % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zone.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;
    const user = await prisma.user.create({
      data: { email: `${tag}@test.mocar.kr`, name: '사진', role: 'USER', passwordHash: 'x' },
    });
    const startAt = new Date(Date.now() + 3600_000);
    const resv = await prisma.reservation.create({
      data: {
        userId: user.id, vehicleId,
        startAt, endAt: new Date(startAt.getTime() + 3600_000),
        status: 'IN_USE', insurance: 'LIGHT',
        rentalFeeKrw: 6000, insuranceFeeKrw: 700, totalUpfrontKrw: 6700,
        rental: { create: { status: 'IN_USE' } },
      },
      include: { rental: true },
    });
    rentalId = resv.rental!.id;
  });

  afterAll(async () => {
    await prisma.conditionPhoto.deleteMany({ where: { report: { rentalId } } });
    await prisma.conditionReport.deleteMany({ where: { rentalId } });
    await prisma.rental.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: tag } });
    await prisma.pricingPlan.deleteMany({ where: { name: tag } });
    await prisma.user.deleteMany({ where: { email: `${tag}@test.mocar.kr` } });
    await app.close();
  });

  it('shared 검증을 통과한 사진이 DB를 왕복한 뒤 data: URI로 되살아난다', async () => {
    const photos = photosSchema.parse([bigPhoto, smallPhoto]);
    const rows = toPhotoRows(photos);
    expect(totalPhotoBytes(rows)).toBe(PHOTO_MAX_BYTES + 4096);

    const report = await prisma.conditionReport.create({
      data: { rentalId, phase: 'CHECK_IN', notes: '사진 파이프라인 확인', photos: { create: rows } },
      select: { id: true },
    });

    const saved = await prisma.conditionPhoto.findMany({
      where: { reportId: report.id },
      orderBy: { bytes: 'desc' },
    });
    const views = toStoredPhotos(saved);

    expect(views).toHaveLength(2);
    expect(views[0].bytes).toBe(PHOTO_MAX_BYTES);
    expect(views[0].dataUri).toBe(`data:${PHOTO_MIME};base64,${bigPhoto.data}`);
    expect(views[1].dataUri.endsWith(smallPhoto.data)).toBe(true);
  });
});
