/**
 * 데모 시드 데이터.
 * - 전국 주요 도시의 존/차량 (region 키는 도로망 그래프 파일과 매칭)
 * - 데모 계정 4종 (README 참고)
 * - 지표/배차 리스크 계산용 과거 이용 이력 (결정적 난수로 재현 가능)
 */
import { PrismaClient, Role, FuelType, InsuranceTier, ReservationStatus, RentalStatus, PaymentKind, PaymentStatus, CreditReason } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';
const prisma = new PrismaClient();

/** 결정적 난수 (시드 고정) */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260831);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

async function main() {
  console.log('seeding...');

  // ── 초기화 (역순 삭제) ──
  await prisma.$transaction([
    prisma.dispatchCandidate.deleteMany(),
    prisma.dispatchRequest.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.rental.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.creditLedger.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.zone.deleteMany(),
    prisma.pricingPlan.deleteMany(),
    prisma.user.deleteMany(),
    prisma.corporation.deleteMany(),
  ]);

  // ── 요금제 ──
  const [planLight, planCompact, planEv, planSuv] = await Promise.all([
    prisma.pricingPlan.create({
      data: {
        name: '경형', baseHourlyKrw: 4000, weekendHourlyKrw: 5000, perKmKrw: 180,
        insuranceLightKrw: 500, insuranceStandardKrw: 1100, insuranceFullKrw: 1800,
      },
    }),
    prisma.pricingPlan.create({
      data: {
        name: '준중형', baseHourlyKrw: 6000, weekendHourlyKrw: 7500, perKmKrw: 200,
        insuranceLightKrw: 700, insuranceStandardKrw: 1400, insuranceFullKrw: 2200,
      },
    }),
    prisma.pricingPlan.create({
      data: {
        name: '전기차', baseHourlyKrw: 7000, weekendHourlyKrw: 8500, perKmKrw: 100,
        insuranceLightKrw: 800, insuranceStandardKrw: 1500, insuranceFullKrw: 2400,
      },
    }),
    prisma.pricingPlan.create({
      data: {
        name: 'SUV', baseHourlyKrw: 9000, weekendHourlyKrw: 11000, perKmKrw: 220,
        insuranceLightKrw: 1000, insuranceStandardKrw: 1800, insuranceFullKrw: 2800,
      },
    }),
  ]);

  // ── 존 (전국) — region은 도로망 그래프 키 ──
  const zoneDefs = [
    { name: '성수역 2번 출구', region: 'seoul', address: '서울 성동구 성수동2가', lat: 37.544579, lng: 127.055961, capacity: 6 },
    { name: '서울숲 공영주차장', region: 'seoul', address: '서울 성동구 성수동1가', lat: 37.544061, lng: 127.037627, capacity: 5 },
    { name: '뚝섬역 공영주차장', region: 'seoul', address: '서울 성동구 성수동1가', lat: 37.547189, lng: 127.047478, capacity: 4 },
    { name: '왕십리역 광장', region: 'seoul', address: '서울 성동구 행당동', lat: 37.561257, lng: 127.037756, capacity: 5 },
    { name: '강남역 12번 출구', region: 'seoul', address: '서울 강남구 역삼동', lat: 37.497175, lng: 127.02758, capacity: 6 },
    { name: '홍대입구역 주차장', region: 'seoul', address: '서울 마포구 동교동', lat: 37.557527, lng: 126.9244669, capacity: 4 },
    { name: '서면역 지하주차장', region: 'busan', address: '부산 부산진구 부전동', lat: 35.157845, lng: 129.059334, capacity: 5 },
    { name: '부산역 광장', region: 'busan', address: '부산 동구 초량동', lat: 35.115225, lng: 129.041538, capacity: 4 },
    { name: '대전역 동광장', region: 'daejeon', address: '대전 동구 정동', lat: 36.331785, lng: 127.434257, capacity: 3 },
    { name: '제주공항 주차장', region: 'jeju', address: '제주 제주시 용담이동', lat: 33.507024, lng: 126.492769, capacity: 6 },
  ];

  const zones = [] as { id: string; name: string }[];
  for (const z of zoneDefs) {
    zones.push(await prisma.zone.create({ data: z }));
  }

  // ── 차량 ──
  const vehicleDefs: { model: string; fuel: FuelType; seats: number; planId: string }[] = [
    { model: '레이', fuel: FuelType.GASOLINE, seats: 4, planId: planLight.id },
    { model: '캐스퍼', fuel: FuelType.GASOLINE, seats: 4, planId: planLight.id },
    { model: '아반떼', fuel: FuelType.GASOLINE, seats: 5, planId: planCompact.id },
    { model: 'K5', fuel: FuelType.GASOLINE, seats: 5, planId: planCompact.id },
    { model: '아이오닉 5', fuel: FuelType.EV, seats: 5, planId: planEv.id },
    { model: 'EV6', fuel: FuelType.EV, seats: 5, planId: planEv.id },
    { model: '쏘렌토', fuel: FuelType.HYBRID, seats: 7, planId: planSuv.id },
    { model: '셀토스', fuel: FuelType.GASOLINE, seats: 5, planId: planSuv.id },
  ];

  const vehicles: { id: string; zoneId: string }[] = [];
  let plateSeq = 1000;
  for (const zone of await prisma.zone.findMany()) {
    const count = 2 + Math.floor(rand() * 2); // 존당 2~3대
    for (let i = 0; i < count; i++) {
      const def = pick(vehicleDefs);
      const v = await prisma.vehicle.create({
        data: {
          modelName: def.model,
          plateNo: `${String(plateSeq++).padStart(2, '0')}허 ${1000 + Math.floor(rand() * 9000)}`,
          fuel: def.fuel,
          seats: def.seats,
          zoneId: zone.id,
          planId: def.planId,
        },
      });
      vehicles.push({ id: v.id, zoneId: zone.id });
    }
  }

  // ── 법인 + 데모 계정 ──
  const corp = await prisma.corporation.create({
    data: {
      name: '주식회사 데모컴퍼니',
      officeAddress: '서울 성동구 성수이로 118',
      officeLat: 37.542312,
      officeLng: 127.054883,
    },
  });

  const passwordHash = await bcrypt.hash('demo1234', 10);
  const [user, corpMember, corpAdmin] = await Promise.all([
    prisma.user.create({
      data: { email: 'user@demo.mocar.kr', name: '김소카', role: Role.USER, passwordHash },
    }),
    prisma.user.create({
      data: { email: 'member@demo.mocar.kr', name: '이직원', role: Role.CORP_MEMBER, corporationId: corp.id, passwordHash },
    }),
    prisma.user.create({
      data: { email: 'admin@demo.mocar.kr', name: '박배차', role: Role.CORP_ADMIN, corporationId: corp.id, passwordHash },
    }),
    prisma.user.create({
      data: { email: 'ops@demo.mocar.kr', name: '최운영', role: Role.OPS_ADMIN, passwordHash },
    }),
  ]);

  // ── 쿠폰/크레딧 ──
  await prisma.coupon.create({
    data: {
      userId: user.id, name: '웰컴 쿠폰 5,000원',
      discountKrw: 5000, expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    },
  });
  await prisma.creditLedger.create({
    data: { userId: user.id, deltaKrw: 10000, reason: CreditReason.SIGNUP_BONUS, memo: '가입 축하 크레딧' },
  });

  // ── 과거 이용 이력 (지표·지연반납 리스크용, 최근 30일) ──
  const demoUsers = [user, corpMember];
  let histCount = 0;
  for (let day = 30; day >= 1; day--) {
    const ridesToday = 1 + Math.floor(rand() * 4);
    for (let r = 0; r < ridesToday; r++) {
      const vehicle = pick(vehicles);
      const startHour = 8 + Math.floor(rand() * 10);
      const durationH = 1 + Math.floor(rand() * 5);
      const startAt = new Date();
      startAt.setDate(startAt.getDate() - day);
      startAt.setHours(startHour, rand() > 0.5 ? 30 : 0, 0, 0);
      const endAt = new Date(startAt.getTime() + durationH * 3600 * 1000);
      const distance = Math.round((5 + rand() * 60) * 10) / 10;
      // 차량별 성향: 일부 차량은 지연 반납이 잦다 (배차 리스크 데이터)
      const lateProne = vehicle.id.charCodeAt(vehicle.id.length - 1) % 5 === 0;
      const lateMinutes = lateProne && rand() < 0.4 ? 10 + Math.floor(rand() * 50) : rand() < 0.05 ? 10 : 0;

      const rentalFee = durationH * 6000;
      const insuranceFee = durationH * 1400;
      const driveFee = Math.round(distance * 200);

      try {
        const resv = await prisma.reservation.create({
          data: {
            userId: pick(demoUsers).id,
            vehicleId: vehicle.id,
            startAt, endAt,
            status: ReservationStatus.COMPLETED,
            insurance: InsuranceTier.STANDARD,
            rentalFeeKrw: rentalFee,
            insuranceFeeKrw: insuranceFee,
            totalUpfrontKrw: rentalFee + insuranceFee,
            createdAt: new Date(startAt.getTime() - 24 * 3600 * 1000),
            rental: {
              create: {
                status: RentalStatus.COMPLETED,
                startedAt: startAt,
                returnedAt: new Date(endAt.getTime() + lateMinutes * 60 * 1000),
                distanceKm: distance,
                lateMinutes,
                driveFeeKrw: driveFee,
                lateFeeKrw: lateMinutes > 0 ? lateMinutes * 200 : 0,
              },
            },
            payments: {
              create: [
                {
                  kind: PaymentKind.UPFRONT, amountKrw: rentalFee + insuranceFee,
                  status: PaymentStatus.CAPTURED, idempotencyKey: `seed-up-${day}-${r}`,
                  cardLast4: '4242', approvedAt: new Date(startAt.getTime() - 24 * 3600 * 1000),
                },
                {
                  kind: PaymentKind.DRIVE_SETTLEMENT, amountKrw: driveFee,
                  status: PaymentStatus.CAPTURED, idempotencyKey: `seed-drv-${day}-${r}`,
                  cardLast4: '4242', approvedAt: endAt,
                },
              ],
            },
          },
        });
        histCount++;
        void resv;
      } catch {
        // EXCLUDE 제약(시간 겹침)에 걸린 이력은 건너뜀 — 시드에서는 무시해도 무방
      }
    }
  }

  console.log(`seeded: zones=${zoneDefs.length}, vehicles=${vehicles.length}, history=${histCount}`);
  console.log('demo accounts (pw: demo1234):');
  console.log('  user@demo.mocar.kr   개인 이용자');
  console.log('  member@demo.mocar.kr 법인 임직원');
  console.log('  admin@demo.mocar.kr  법인 배차 담당');
  console.log('  ops@demo.mocar.kr    운영 어드민');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
