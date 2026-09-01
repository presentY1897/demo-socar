import {
  authUserSchema,
  couponSchema,
  pricingPlanSchema,
  reservationSchema,
  vehicleSummarySchema,
  zoneDetailSchema,
  zoneMarkerSchema,
  type ZoneDetailRes,
  type ZoneMarkerRes,
} from '@socar/shared';

/**
 * 목 데이터 픽스처.
 *
 * 모든 픽스처는 shared의 응답 스키마로 `parse` 해서 만든다 — API 계약이 바뀌면
 * 여기서 먼저 터지고, 계약과 어긋난 목으로 프론트 테스트가 통과하는 일이 없다.
 */
const make = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T =>
  schema.parse(value);

export const planStandard = make(pricingPlanSchema, {
  id: 'plan-compact',
  name: '준중형',
  baseHourlyKrw: 9000,
  weekendHourlyKrw: 11000,
  perKmKrw: 180,
  insuranceLightKrw: 1200,
  insuranceStandardKrw: 2200,
  insuranceFullKrw: 3500,
});

export const planEv = make(pricingPlanSchema, {
  ...planStandard,
  id: 'plan-ev',
  name: '준중형 EV',
  perKmKrw: 0,
});

export const zoneGangnam = make(zoneMarkerSchema, {
  id: 'zone-gangnam',
  name: '강남역 공영주차장',
  region: 'seoul',
  address: '서울 강남구 강남대로 지하 396',
  lat: 37.4979,
  lng: 127.0276,
  capacity: 12,
  corporationId: null,
  vehicleCount: 2,
});

export const zoneSeomyeon = make(zoneMarkerSchema, {
  id: 'zone-seomyeon',
  name: '서면역 환승주차장',
  region: 'busan',
  address: '부산 부산진구 중앙대로 지하 730',
  lat: 35.1578,
  lng: 129.0594,
  capacity: 8,
  corporationId: null,
  vehicleCount: 0,
});

export const zoneMarkers: ZoneMarkerRes[] = [zoneGangnam, zoneSeomyeon];

export const vehicleAvante = make(vehicleSummarySchema, {
  id: 'veh-avante',
  modelName: '아반떼',
  plateNo: '12가 3456',
  fuel: 'GASOLINE',
  seats: 5,
  status: 'AVAILABLE',
  imageUrl: null,
  zoneId: zoneGangnam.id,
  planId: planStandard.id,
  corporationId: null,
  plan: planStandard,
});

export const vehicleIoniq = make(vehicleSummarySchema, {
  ...vehicleAvante,
  id: 'veh-ioniq',
  modelName: '아이오닉 5',
  plateNo: '34나 5678',
  fuel: 'EV',
  planId: planEv.id,
  plan: planEv,
});

/** 강남 존 상세 — 바로 픽업 1대 + 부름 1대 */
export const zoneGangnamDetail: ZoneDetailRes = make(zoneDetailSchema, {
  ...zoneGangnam, // vehicleCount는 상세 스키마에 없어 parse에서 걸러진다
  vehicles: [{ ...vehicleAvante, estimatedRentalKrw: 18000 }],
  deliverable: [
    {
      ...vehicleIoniq,
      estimatedRentalKrw: 18000,
      fromZone: { id: 'zone-yeoksam', name: '역삼역 주차장' },
      deliveryFeeEstimateKrw: 6000,
      deliveryEtaMinutes: 12,
    },
  ],
});

export const zoneSeomyeonDetail: ZoneDetailRes = make(zoneDetailSchema, {
  ...zoneSeomyeon,
  vehicles: [],
  deliverable: [],
});

export const zoneDetails: Record<string, ZoneDetailRes> = {
  [zoneGangnam.id]: zoneGangnamDetail,
  [zoneSeomyeon.id]: zoneSeomyeonDetail,
};

// ─────────────────────────── 계정 ───────────────────────────

export const userPersonal = make(authUserSchema, {
  id: 'user-personal',
  email: 'user@demo.mocar.kr',
  name: '김개인',
  role: 'USER',
  corporationId: null,
});

export const userCorpAdmin = make(authUserSchema, {
  id: 'user-corp-admin',
  email: 'corpadmin@demo.mocar.kr',
  name: '박배차',
  role: 'CORP_ADMIN',
  corporationId: 'corp-1',
});

export const userOpsAdmin = make(authUserSchema, {
  id: 'user-ops',
  email: 'ops@demo.mocar.kr',
  name: '이운영',
  role: 'OPS_ADMIN',
  corporationId: null,
});

export const couponWelcome = make(couponSchema, {
  id: 'coupon-welcome',
  userId: userPersonal.id,
  name: '가입 축하 5,000원',
  discountKrw: 5000,
  expiresAt: '2030-12-31T14:59:59.000Z',
  usedAt: null,
});

export const reservationConfirmed = make(reservationSchema, {
  id: 'resv-1',
  userId: userPersonal.id,
  vehicleId: vehicleAvante.id,
  startAt: '2030-01-02T01:00:00.000Z',
  endAt: '2030-01-02T03:00:00.000Z',
  status: 'CONFIRMED',
  insurance: 'STANDARD',
  returnZoneId: null,
  deliveryLat: null,
  deliveryLng: null,
  deliveryLabel: null,
  rentalFeeKrw: 18000,
  insuranceFeeKrw: 4400,
  onewayFeeKrw: 0,
  deliveryFeeKrw: 0,
  discountKrw: 0,
  creditUsedKrw: 0,
  totalUpfrontKrw: 22400,
  createdAt: '2030-01-01T00:00:00.000Z',
  canceledAt: null,
  vehicle: { ...vehicleAvante, zone: zoneGangnam },
  returnZone: null,
  rental: null,
});
