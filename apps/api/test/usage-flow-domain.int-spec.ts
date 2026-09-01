/**
 * 이용 플로우 도메인(M1-1) 스모크 통합 테스트 — 신규 모델 저장/조회.
 * 실행 전제: 로컬 PostgreSQL + 마이그레이션 적용 (README 참고)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';

/** 압축 사진을 대신하는 아주 작은 base64 JPEG 조각 */
const PHOTO_BASE64 = Buffer.from('mocar-demo-photo').toString('base64');

describe('이용 플로우 도메인 (통합) — 체크인/아웃·스마트키·문의·사고', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let vehicleId: string;
  let userId: string;
  let rentalId: string;
  const email = `usage-flow-${Date.now()}@test.mocar.kr`;
  const planName = `usage-flow-plan-${Date.now()}`;
  const zoneName = `usage-flow-zone-${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const plan = await prisma.pricingPlan.create({
      data: {
        name: planName, baseHourlyKrw: 6000, weekendHourlyKrw: 7500, perKmKrw: 200,
        insuranceLightKrw: 700, insuranceStandardKrw: 1400, insuranceFullKrw: 2200,
      },
    });
    const zone = await prisma.zone.create({
      data: { name: zoneName, region: 'seoul', address: '테스트', lat: 37.5445, lng: 127.0559, capacity: 2 },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        modelName: '테스트카UF', plateNo: `97테${Date.now() % 10000}`,
        fuel: 'GASOLINE', seats: 5, zoneId: zone.id, planId: plan.id,
      },
    });
    vehicleId = vehicle.id;
    const user = await prisma.user.create({
      data: { email, name: '이용플로우', role: 'USER', passwordHash: await bcrypt.hash('test1234', 4) },
    });
    userId = user.id;

    // 대여 1건 (체크인/아웃·스마트키·사고가 매달릴 부모)
    const startAt = new Date(Date.now() + 24 * 3600 * 1000);
    const reservation = await prisma.reservation.create({
      data: {
        userId, vehicleId,
        startAt, endAt: new Date(startAt.getTime() + 2 * 3600 * 1000),
        status: 'IN_USE', insurance: 'STANDARD',
        rentalFeeKrw: 12000, insuranceFeeKrw: 2800, totalUpfrontKrw: 14800,
        rental: { create: { status: 'IN_USE' } },
      },
      include: { rental: true },
    });
    rentalId = reservation.rental!.id;
  });

  afterAll(async () => {
    await prisma.incidentPhoto.deleteMany({ where: { incident: { rentalId } } });
    await prisma.incidentReport.deleteMany({ where: { rentalId } });
    await prisma.conditionPhoto.deleteMany({ where: { report: { rentalId } } });
    await prisma.conditionReport.deleteMany({ where: { rentalId } });
    await prisma.vehicleControlLog.deleteMany({ where: { rentalId } });
    await prisma.inquiry.deleteMany({ where: { userId } });
    await prisma.rental.deleteMany({ where: { reservation: { vehicleId } } });
    await prisma.reservation.deleteMany({ where: { vehicleId } });
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    await prisma.zone.deleteMany({ where: { name: zoneName } });
    await prisma.pricingPlan.deleteMany({ where: { name: planName } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('체크인/체크아웃 상태 보고를 사진과 함께 저장하고 단계별로 조회한다', async () => {
    const checkIn = await prisma.conditionReport.create({
      data: {
        rentalId,
        phase: 'CHECK_IN',
        notes: '앞범퍼 우측 하단에 기존 흠집 있음',
        photos: {
          create: [
            { mime: 'image/jpeg', data: PHOTO_BASE64, bytes: 190_000 },
            { mime: 'image/jpeg', data: PHOTO_BASE64, bytes: 175_000 },
          ],
        },
      },
      include: { photos: true },
    });
    expect(checkIn.photos).toHaveLength(2);
    expect(checkIn.parkingNote).toBeNull();

    await prisma.conditionReport.create({
      data: {
        rentalId,
        phase: 'CHECK_OUT',
        notes: '이상 없음',
        parkingNote: '지하 2층 B-14',
        photos: { create: [{ mime: 'image/jpeg', data: PHOTO_BASE64, bytes: 165_000 }] },
      },
    });

    // 조회: 대여 기준 단계별 1건씩
    const reports = await prisma.conditionReport.findMany({
      where: { rentalId },
      include: { photos: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(reports.map((r) => r.phase)).toEqual(['CHECK_IN', 'CHECK_OUT']);
    expect(reports[0].notes).toContain('기존 흠집');
    expect(reports[1].parkingNote).toBe('지하 2층 B-14');
    expect(reports[1].photos[0].data).toBe(PHOTO_BASE64);

    // 대여 쪽 역참조로도 같은 결과가 나온다
    const rental = await prisma.rental.findUniqueOrThrow({
      where: { id: rentalId },
      include: { conditionReports: true },
    });
    expect(rental.conditionReports).toHaveLength(2);
  });

  it('스마트키 조작 이력·문의·사고 접수가 저장되고 차량 임시 상태가 갱신된다', async () => {
    // 차량 임시 상태 기본값: 잠김 + 시동 꺼짐
    const before = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(before.doorLocked).toBe(true);
    expect(before.engineOn).toBe(false);

    await prisma.vehicleControlLog.createMany({
      data: [
        { rentalId, vehicleId, action: 'UNLOCK' },
        { rentalId, vehicleId, action: 'IGNITION_ON' },
      ],
    });
    const after = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { doorLocked: false, engineOn: true },
    });
    expect(after.doorLocked).toBe(false);
    expect(after.engineOn).toBe(true);

    const logs = await prisma.vehicleControlLog.findMany({ where: { rentalId }, orderBy: { at: 'asc' } });
    expect(logs.map((l) => l.action)).toEqual(['UNLOCK', 'IGNITION_ON']);

    // 문의: 접수(OPEN) → 답변(ANSWERED)
    const inquiry = await prisma.inquiry.create({
      data: { userId, vehicleId, rentalId, category: 'VEHICLE', body: '블루투스 연결이 안 됩니다' },
    });
    expect(inquiry.status).toBe('OPEN');
    const answered = await prisma.inquiry.update({
      where: { id: inquiry.id },
      data: { status: 'ANSWERED', answer: '센터 디스플레이에서 페어링 초기화 후 재시도 부탁드립니다', answeredAt: new Date() },
    });
    expect(answered.status).toBe('ANSWERED');
    expect(answered.answeredAt).not.toBeNull();

    // 사고 접수: 기본 상태 RECEIVED + 사진은 접수 삭제 시 함께 정리된다
    const incident = await prisma.incidentReport.create({
      data: {
        rentalId,
        description: '주차 중 후방 범퍼 접촉',
        photos: { create: [{ mime: 'image/jpeg', data: PHOTO_BASE64, bytes: 150_000 }] },
      },
      include: { photos: true },
    });
    expect(incident.status).toBe('RECEIVED');
    expect(incident.photos).toHaveLength(1);

    await prisma.incidentReport.delete({ where: { id: incident.id } });
    expect(await prisma.incidentPhoto.count({ where: { incidentId: incident.id } })).toBe(0);
  });
});
