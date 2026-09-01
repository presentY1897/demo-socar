/**
 * 데모 시드 데이터.
 * - 전국 주요 도시의 존/차량 (region 키는 도로망 그래프 파일과 매칭)
 * - 데모 계정 7종 (README 참고) — 법인 계정은 등급(corpGrade)까지 부여
 * - 지표/배차 리스크 계산용 과거 이용 이력 (결정적 난수로 재현 가능)
 */
import { PrismaClient, Role, CorpGrade, FuelType, InsuranceTier, ReservationStatus, RentalStatus, PaymentKind, PaymentStatus, CreditReason, LeaseStatus, HandlerTaskType, HandlerTaskStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DELIVERY_MIN_LEAD_MINUTES } from '@socar/shared';
import { MANUAL_MODEL_NAMES } from '../vehicles/vehicle-manual';

/**
 * 시드 데이터 버전. 시드 내용(존/차량/계정 구성)이 바뀌면 +1 —
 * 배포 환경에서 DB에 기록된 버전과 비교해 자동으로 1회 재시드된다 (main.ts).
 *   v1: 초기 시드 (수동 존 10곳)
 *   v2: 실데이터 존 30곳 (전국주차장정보표준데이터 + OSM)
 *   v3: 이용 플로우 도메인 추가 (체크인/아웃·스마트키·문의·사고) — 재시드 시 신규 테이블도 함께 초기화
 *   v4: 법인 등급(corpGrade) 부여 + 리스 계약(LeaseContract) + viewer 계정
 *   v5: approver 계정 추가 — 등급 4종을 계정 스위칭만으로 시연할 수 있게
 *   v6: 핸들러 도메인 추가 (HANDLER 계정 + 부름 배달/회수·재배치 샘플 작업)
 */
export const SEED_VERSION = 6;

interface ZoneDef {
  name: string;
  region: string;
  address: string;
  lat: number;
  lng: number;
  capacity: number;
}

/**
 * 존 정의: build:zones가 만든 실데이터(data/zones.json)가 있으면 그것을,
 * 없으면 내장 기본값을 쓴다. (실데이터 = 전국주차장정보표준데이터 + OSM)
 */
function loadZoneDefs(): ZoneDef[] {
  const file = path.resolve(process.cwd(), 'data/zones.json');
  if (fs.existsSync(file)) {
    const zones = JSON.parse(fs.readFileSync(file, 'utf8')) as ZoneDef[];
    console.log(`실데이터 존 로드: ${zones.length}곳 (data/zones.json)`);
    return zones.map((z) => ({
      name: z.name, region: z.region, address: z.address,
      lat: z.lat, lng: z.lng, capacity: z.capacity,
    }));
  }
  console.log('data/zones.json 없음 — 내장 기본 존 사용');
  return FALLBACK_ZONES;
}

const FALLBACK_ZONES: ZoneDef[] = [
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

/**
 * 한꺼번에 만든 시드 행을 **이름으로** 되찾는다.
 *
 * `const [a, b] = await Promise.all([...])` 식의 위치 기반 구조 분해는 중간에 항목이
 * 하나 끼어들면 이름과 실체가 조용히 어긋난다 — 실제로 계정 배열에서 한 번 터졌다
 * (M5가 법인 등급 계정을 추가하자 핸들러 작업이 승인자에게 배정됐다).
 */
function seeded<T, K extends keyof T>(rows: T[], key: K, value: T[K]): T {
  const found = rows.find((row) => row[key] === value);
  if (!found) throw new Error(`시드 데이터 누락: ${String(key)}=${String(value)}`);
  return found;
}

export async function runSeed(prisma: PrismaClient) {
  console.log('seeding...');

  // ── 초기화 (역순 삭제) ──
  await prisma.$transaction([
    prisma.handlerTaskPhoto.deleteMany(),
    prisma.handlerTask.deleteMany(),
    prisma.dispatchCandidate.deleteMany(),
    prisma.dispatchRequest.deleteMany(),
    prisma.incidentPhoto.deleteMany(),
    prisma.incidentReport.deleteMany(),
    prisma.conditionPhoto.deleteMany(),
    prisma.conditionReport.deleteMany(),
    prisma.vehicleControlLog.deleteMany(),
    prisma.inquiry.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.rental.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.creditLedger.deleteMany(),
    prisma.leaseContract.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.zone.deleteMany(),
    prisma.pricingPlan.deleteMany(),
    prisma.user.deleteMany(),
    prisma.corporation.deleteMany(),
  ]);

  // ── 요금제 ──
  const plans = await Promise.all([
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
  const planLight = seeded(plans, 'name', '경형');
  const planCompact = seeded(plans, 'name', '준중형');
  const planEv = seeded(plans, 'name', '전기차');
  const planSuv = seeded(plans, 'name', 'SUV');

  // ── 존 (전국) — 실데이터(data/zones.json) 우선, region은 도로망 그래프 키 ──
  const zoneDefs = loadZoneDefs();

  const zones = [] as { id: string; name: string; lat: number; lng: number }[];
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

  // 법인 계정은 Role(전역 역할) + corpGrade(법인 내 등급)를 함께 갖는다.
  // 등급→권한 판정은 packages/shared 의 CORP_PERMISSIONS 가 단일 소스.
  const passwordHash = await bcrypt.hash('demo1234', 10);
  // 이메일로 꺼내 쓴다 — 위치 기반 구조 분해는 계정이 하나 끼어들 때 조용히 어긋난다
  const accounts = await Promise.all([
    prisma.user.create({
      data: { email: 'user@demo.mocar.kr', name: '김소카', role: Role.USER, passwordHash },
    }),
    prisma.user.create({
      data: { email: 'member@demo.mocar.kr', name: '이직원', role: Role.CORP_MEMBER, corporationId: corp.id, corpGrade: CorpGrade.REQUESTER, passwordHash },
    }),
    prisma.user.create({
      data: { email: 'admin@demo.mocar.kr', name: '박배차', role: Role.CORP_ADMIN, corporationId: corp.id, corpGrade: CorpGrade.MANAGER, passwordHash },
    }),
    prisma.user.create({
      data: { email: 'viewer@demo.mocar.kr', name: '한조회', role: Role.CORP_MEMBER, corporationId: corp.id, corpGrade: CorpGrade.VIEWER, passwordHash },
    }),
    // 승인만 하는 등급 — Role은 임직원(CORP_MEMBER)이지만 등급이 APPROVER라
    // 승인/보드까지 가능하다. 권한이 Role이 아니라 등급에서 나온다는 걸 보여주는 계정.
    prisma.user.create({
      data: { email: 'approver@demo.mocar.kr', name: '정승인', role: Role.CORP_MEMBER, corporationId: corp.id, corpGrade: CorpGrade.APPROVER, passwordHash },
    }),
    prisma.user.create({
      data: { email: 'ops@demo.mocar.kr', name: '최운영', role: Role.OPS_ADMIN, passwordHash },
    }),
    prisma.user.create({
      data: { email: 'handler@demo.mocar.kr', name: '한기사', role: Role.HANDLER, passwordHash },
    }),
  ]);
  const user = seeded(accounts, 'email', 'user@demo.mocar.kr');
  const corpMember = seeded(accounts, 'email', 'member@demo.mocar.kr');
  const handler = seeded(accounts, 'email', 'handler@demo.mocar.kr');

  // ── 법인 전용존 + 전용 차량 (= 법인이 MOCAR에서 리스한 차량 — 아래 리스 계약과 짝) ──
  const corpZone = await prisma.zone.create({
    data: {
      name: '데모컴퍼니 사옥 주차장',
      region: 'seoul',
      address: corp.officeAddress,
      lat: corp.officeLat,
      lng: corp.officeLng,
      capacity: 3,
      corporationId: corp.id,
    },
  });
  const dedicatedVehicles = await Promise.all([
    prisma.vehicle.create({
      data: {
        modelName: '아이오닉 5', plateNo: '00허 0001', fuel: FuelType.EV, seats: 5,
        zoneId: corpZone.id, planId: planEv.id, corporationId: corp.id,
      },
    }),
    prisma.vehicle.create({
      data: {
        modelName: '카니발', plateNo: '00허 0002', fuel: FuelType.GASOLINE, seats: 7,
        zoneId: corpZone.id, planId: planSuv.id, corporationId: corp.id,
      },
    }),
  ]);
  const dedicatedEv = seeded(dedicatedVehicles, 'plateNo', '00허 0001');
  const dedicatedVan = seeded(dedicatedVehicles, 'plateNo', '00허 0002');

  // ── 리스 계약 (법인 ↔ MOCAR) ──
  // 전용 차량 = MOCAR가 법인에 리스한 차량. 차량 1대당 진행 중(ACTIVE) 계약 1건이 원칙이고,
  // 종료된 과거 계약은 이력으로 남긴다. 카니발은 만기 임박(D-24) 케이스.
  const monthsFromNow = (months: number, days = 0) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  await prisma.leaseContract.createMany({
    data: [
      {
        corporationId: corp.id,
        vehicleId: dedicatedEv.id,
        monthlyFeeKrw: 690000,
        startAt: monthsFromNow(-6),
        endAt: monthsFromNow(6),
        status: LeaseStatus.ACTIVE,
      },
      {
        // 만기 임박 — /biz/fleet 의 D-day 강조 케이스
        corporationId: corp.id,
        vehicleId: dedicatedVan.id,
        monthlyFeeKrw: 890000,
        startAt: monthsFromNow(-11),
        endAt: monthsFromNow(0, 24),
        status: LeaseStatus.ACTIVE,
      },
      {
        // 종료된 이전 계약 (계약 이력)
        corporationId: corp.id,
        vehicleId: dedicatedEv.id,
        monthlyFeeKrw: 650000,
        startAt: monthsFromNow(-30),
        endAt: monthsFromNow(-6),
        endedAt: monthsFromNow(-6),
        status: LeaseStatus.ENDED,
      },
    ],
  });

  // 전용 차량 운행 이력 (운행일지 — 과금 없음). 카니발은 지연 반납이 잦은 차로 만든다
  for (let day = 20; day >= 1; day -= 2) {
    const vehicle = rand() > 0.4 ? dedicatedEv : dedicatedVan;
    const isVan = vehicle.id === dedicatedVan.id;
    const startAt = new Date();
    startAt.setDate(startAt.getDate() - day);
    startAt.setHours(9 + Math.floor(rand() * 6), rand() > 0.5 ? 30 : 0, 0, 0);
    const endAt = new Date(startAt.getTime() + (1 + Math.floor(rand() * 3)) * 3600 * 1000);
    const lateMinutes = isVan && rand() < 0.5 ? 15 + Math.floor(rand() * 40) : 0;
    try {
      await prisma.reservation.create({
        data: {
          userId: corpMember.id,
          vehicleId: vehicle.id,
          startAt, endAt,
          status: ReservationStatus.COMPLETED,
          insurance: InsuranceTier.STANDARD,
          rentalFeeKrw: 0, insuranceFeeKrw: 0, totalUpfrontKrw: 0,
          createdAt: new Date(startAt.getTime() - 3600 * 1000),
          rental: {
            create: {
              status: RentalStatus.COMPLETED,
              startedAt: startAt,
              returnedAt: new Date(endAt.getTime() + lateMinutes * 60 * 1000),
              distanceKm: Math.round((10 + rand() * 40) * 10) / 10,
              lateMinutes,
              driveFeeKrw: 0,
              lateFeeKrw: 0,
            },
          },
        },
      });
    } catch {
      // 시간 겹침(EXCLUDE 제약)은 건너뜀
    }
  }

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
    // 차량 규모에 비례한 일별 이용량
    const ridesToday = 1 + Math.floor(rand() * Math.max(4, vehicles.length / 5));
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

  // ── 핸들러 샘플 작업 (M2-1) ──
  // 로그인 직후 "미배정 공개 작업 수락 → 내 작업 진행" 흐름이 바로 보이도록
  // 미배정 2건(배달·재배치)과 배정 1건(회수)을 만든다.
  // M2-2가 붙으면 배달/회수 작업은 부름 예약의 생명주기에서 자동으로 생성된다.
  const taskZones = zones.filter((z) => vehicles.some((v) => v.zoneId === z.id));
  const vehicleInZone = (zoneId: string) => vehicles.find((v) => v.zoneId === zoneId)!;
  /** 지금 기준 오프셋의 10분 슬롯 */
  const slot = (offsetMinutes: number) => {
    const t = new Date(Date.now() + offsetMinutes * 60 * 1000);
    t.setSeconds(0, 0);
    t.setMinutes(Math.floor(t.getMinutes() / 10) * 10);
    return t;
  };
  let taskCount = 0;

  if (taskZones.length >= 2) {
    // ① 부름 배달 — 3시간 뒤 시작하는 부름 예약, 아직 담당자가 없다(공개 작업)
    const deliveryZone = taskZones[0];
    const deliveryVehicle = vehicleInZone(deliveryZone.id);
    const deliveryStartAt = slot(180);
    const deliveryPoint = {
      lat: Math.round((deliveryZone.lat + 0.004) * 1e6) / 1e6,
      lng: Math.round((deliveryZone.lng + 0.004) * 1e6) / 1e6,
      label: `${deliveryZone.name} 인근 아파트 정문`,
    };
    const deliveryResv = await prisma.reservation.create({
      data: {
        userId: user.id,
        vehicleId: deliveryVehicle.id,
        startAt: deliveryStartAt,
        endAt: new Date(deliveryStartAt.getTime() + 3 * 3600 * 1000),
        status: ReservationStatus.CONFIRMED,
        insurance: InsuranceTier.STANDARD,
        deliveryLat: deliveryPoint.lat,
        deliveryLng: deliveryPoint.lng,
        deliveryLabel: deliveryPoint.label,
        rentalFeeKrw: 18000, insuranceFeeKrw: 4200, deliveryFeeKrw: 6000, totalUpfrontKrw: 28200,
        payments: {
          create: [{
            kind: PaymentKind.UPFRONT, amountKrw: 28200, status: PaymentStatus.CAPTURED,
            idempotencyKey: 'seed-handler-delivery', cardLast4: '4242', approvedAt: new Date(),
          }],
        },
      },
    });
    await prisma.handlerTask.create({
      data: {
        type: HandlerTaskType.DELIVERY,
        status: HandlerTaskStatus.PENDING,
        reservationId: deliveryResv.id,
        vehicleId: deliveryVehicle.id,
        fromZoneId: deliveryZone.id,
        toLat: deliveryPoint.lat, toLng: deliveryPoint.lng, toLabel: deliveryPoint.label,
        // 이용 시작 − 리드타임(ADR-006): 이 시각까지 수령지에 차를 대야 한다
        dueAt: new Date(deliveryStartAt.getTime() - DELIVERY_MIN_LEAD_MINUTES * 60 * 1000),
      },
    });
    taskCount++;

    // ② 부름 회수 — 방금 끝난 이용, 핸들러에게 이미 배정된 상태
    const retrieveZone = taskZones[1];
    const retrieveVehicle = vehicleInZone(retrieveZone.id);
    const retrieveEndAt = slot(-10);
    const retrieveStartAt = new Date(retrieveEndAt.getTime() - 3 * 3600 * 1000);
    const retrievePoint = {
      lat: Math.round((retrieveZone.lat - 0.003) * 1e6) / 1e6,
      lng: Math.round((retrieveZone.lng + 0.003) * 1e6) / 1e6,
      label: `${retrieveZone.name} 인근 주민센터 앞`,
    };
    const retrieveResv = await prisma.reservation.create({
      data: {
        userId: user.id,
        vehicleId: retrieveVehicle.id,
        startAt: retrieveStartAt,
        endAt: retrieveEndAt,
        status: ReservationStatus.COMPLETED,
        insurance: InsuranceTier.LIGHT,
        deliveryLat: retrievePoint.lat,
        deliveryLng: retrievePoint.lng,
        deliveryLabel: retrievePoint.label,
        rentalFeeKrw: 18000, insuranceFeeKrw: 2100, deliveryFeeKrw: 6000, totalUpfrontKrw: 26100,
        createdAt: new Date(retrieveStartAt.getTime() - 2 * 3600 * 1000),
        rental: {
          create: {
            status: RentalStatus.COMPLETED,
            startedAt: retrieveStartAt, returnedAt: retrieveEndAt,
            distanceKm: 24.6, lateMinutes: 0, driveFeeKrw: 4920, lateFeeKrw: 0,
          },
        },
      },
    });
    await prisma.handlerTask.create({
      data: {
        type: HandlerTaskType.RETRIEVE,
        status: HandlerTaskStatus.ASSIGNED,
        reservationId: retrieveResv.id,
        vehicleId: retrieveVehicle.id,
        // 회수는 수령지(좌표)에서 출발해 원래 존으로 되돌린다 — 제자리 회수(ADR-006)
        fromZoneId: retrieveZone.id,
        fromLat: retrievePoint.lat, fromLng: retrievePoint.lng, fromLabel: retrievePoint.label,
        toZoneId: retrieveZone.id,
        assigneeId: handler.id,
        assignedAt: new Date(),
        dueAt: slot(50),
      },
    });
    taskCount++;

    // ③ 재배치 — 운영자가 낸 존 간 이동 작업 (공개, 오늘 중 처리)
    // 인덱스로 존을 고르면(taskZones[2] ?? taskZones[0]) 존이 모자랄 때 앞 작업의 존으로
    // 되돌아오고, 그 존의 첫 차량 = 이미 작업이 걸린 차량이 된다 — 한 대에 살아 있는 작업
    // 두 건이 생긴다. 그래서 "아직 작업이 없는 차량"을 기준으로 고른다.
    const busy = new Set([deliveryVehicle.id, retrieveVehicle.id]);
    const usedZones = new Set([deliveryZone.id, retrieveZone.id]);
    // 앞 작업이 쓰지 않은 존을 먼저 본다 (존이 넉넉하면 예전과 같은 존을 고른다)
    const candidateZones = [
      ...taskZones.filter((z) => !usedZones.has(z.id)),
      ...taskZones.filter((z) => usedZones.has(z.id)),
    ];
    const freeVehicleIn = (zoneId: string) =>
      vehicles.find((v) => v.zoneId === zoneId && !busy.has(v.id));
    const repositionVehicle = candidateZones.map((z) => freeVehicleIn(z.id)).find((v) => v);
    const repositionTo = candidateZones.find((z) => z.id !== repositionVehicle?.zoneId);
    if (repositionVehicle && repositionTo) {
      await prisma.handlerTask.create({
        data: {
          type: HandlerTaskType.REPOSITION,
          status: HandlerTaskStatus.PENDING,
          vehicleId: repositionVehicle.id,
          fromZoneId: repositionVehicle.zoneId,
          toZoneId: repositionTo.id,
          dueAt: slot(8 * 60),
        },
      });
      taskCount++;
    }
  }

  await prisma.seedMeta.upsert({
    where: { id: 1 },
    create: { id: 1, version: SEED_VERSION },
    update: { version: SEED_VERSION, seededAt: new Date() },
  });

  // 차종별 매뉴얼(모의 콘텐츠)은 DB가 아니라 API 정적 데이터로 관리한다 —
  // 시드에 새 차종을 넣고 매뉴얼을 빠뜨리면 여기서 바로 드러난다.
  const seededModels = [...new Set((await prisma.vehicle.findMany({ select: { modelName: true } })).map((v) => v.modelName))];
  const missingManuals = seededModels.filter((m) => !MANUAL_MODEL_NAMES.includes(m));
  if (missingManuals.length > 0) {
    console.warn(`⚠️ 매뉴얼 콘텐츠 없는 차종: ${missingManuals.join(', ')} (src/vehicles/vehicle-manual.ts)`);
  }

  const leaseCount = await prisma.leaseContract.count();
  console.log(
    `seeded: v${SEED_VERSION}, zones=${zoneDefs.length}, vehicles=${vehicles.length}, history=${histCount}, manuals=${MANUAL_MODEL_NAMES.length}, leases=${leaseCount}, handlerTasks=${taskCount}`,
  );
  console.log('demo accounts (pw: demo1234):');
  console.log('  user@demo.mocar.kr     개인 이용자');
  console.log('  viewer@demo.mocar.kr   법인 임직원 (등급 VIEWER — 조회만)');
  console.log('  member@demo.mocar.kr   법인 임직원 (등급 REQUESTER — 배차 요청)');
  console.log('  approver@demo.mocar.kr 법인 임직원 (등급 APPROVER — 승인/보드)');
  console.log('  admin@demo.mocar.kr    법인 배차 담당 (등급 MANAGER — 멤버/플릿 관리)');
  console.log('  ops@demo.mocar.kr      운영 어드민');
  console.log('  handler@demo.mocar.kr  핸들러(운송기사)');
}

