import {
  authUserSchema,
  conditionReportSchema,
  couponSchema,
  paymentSchema,
  pricingPlanSchema,
  rentalSchema,
  incidentResultSchema,
  inquirySchema,
  rentalUsageSchema,
  reservationSchema,
  smartKeyStateSchema,
  vehicleSummarySchema,
  zoneDetailSchema,
  zoneMarkerSchema,
  INSURANCE_META,
  MOCK_INSURER,
  type ConditionReportRes,
  type IncidentResultRes,
  type InquiryRes,
  type RentalUsageRes,
  type ReservationRes,
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
  payments: [
    {
      id: 'pay-upfront',
      reservationId: 'resv-1',
      kind: 'UPFRONT',
      amountKrw: 22400,
      status: 'CAPTURED',
      cardLast4: '4242',
      approvedAt: '2030-01-01T00:00:01.000Z',
      createdAt: '2030-01-01T00:00:00.000Z',
    },
  ],
});

// ─────────────────────────── 결제 / 대여 ───────────────────────────

export const paymentUpfront = make(paymentSchema, {
  id: 'pay-upfront',
  reservationId: 'resv-1',
  kind: 'UPFRONT',
  amountKrw: 22400,
  status: 'CAPTURED',
  cardLast4: '4242',
  approvedAt: '2030-01-01T00:00:01.000Z',
  createdAt: '2030-01-01T00:00:00.000Z',
});

export const rentalInUse = make(rentalSchema, {
  id: 'rental-1',
  reservationId: 'resv-2',
  status: 'IN_USE',
  startedAt: '2030-01-02T01:00:30.000Z',
  returnedAt: null,
  distanceKm: null,
  lateMinutes: 0,
  driveFeeKrw: null,
  lateFeeKrw: null,
});

export const rentalCompleted = make(rentalSchema, {
  ...rentalInUse,
  status: 'COMPLETED',
  returnedAt: '2030-01-02T02:50:00.000Z',
  distanceKm: 31.4,
  driveFeeKrw: 252,
  lateFeeKrw: 0,
});

/** 이용 중 예약 — 단계형 화면(체크인→반납)이 도는 기본 상태 */
export const reservationInUse: ReservationRes = make(reservationSchema, {
  ...reservationConfirmed,
  id: 'resv-2',
  status: 'IN_USE',
  payments: [{ ...paymentUpfront, id: 'pay-upfront-2', reservationId: 'resv-2' }],
  rental: rentalInUse,
});

// ─────────────────────── 이용 플로우 (체크인/아웃) ───────────────────────

/** 1×1 투명 JPEG 자리를 대신하는 짧은 base64 (내용은 검증하지 않는다) */
const PHOTO_DATA = Buffer.from('mocar-demo-photo').toString('base64');
const storedPhoto = (id: string) => ({
  id,
  mime: 'image/jpeg',
  bytes: 150_000,
  dataUri: `data:image/jpeg;base64,${PHOTO_DATA}`,
});

export const conditionCheckIn: ConditionReportRes = make(conditionReportSchema, {
  id: 'report-check-in',
  rentalId: rentalInUse.id,
  phase: 'CHECK_IN',
  notes: '앞범퍼 우측 하단 기존 흠집',
  parkingNote: null,
  createdAt: '2030-01-02T01:01:00.000Z',
  photos: [storedPhoto('photo-in-1')],
});

export const conditionCheckOut: ConditionReportRes = make(conditionReportSchema, {
  id: 'report-check-out',
  rentalId: rentalInUse.id,
  phase: 'CHECK_OUT',
  notes: null,
  parkingNote: '지하 2층 B-14',
  createdAt: '2030-01-02T02:45:00.000Z',
  photos: [storedPhoto('photo-out-1')],
});

/** 스마트키 초기 상태 — 문 잠김·시동 꺼짐 */
export const smartKeyLocked = make(smartKeyStateSchema, {
  doorLocked: true,
  engineOn: false,
  lastAction: null,
  lastActionAt: null,
});

/** 체크인/아웃 전 기본 상태 */
export const usageEmpty: RentalUsageRes = make(rentalUsageSchema, {
  rentalId: rentalInUse.id,
  checkIn: null,
  checkOut: null,
  smartKey: smartKeyLocked,
});

export const usageCheckedIn: RentalUsageRes = make(rentalUsageSchema, {
  ...usageEmpty,
  checkIn: conditionCheckIn,
});

export const usageCheckedOut: RentalUsageRes = make(rentalUsageSchema, {
  ...usageEmpty,
  checkIn: conditionCheckIn,
  checkOut: conditionCheckOut,
});

// ─────────────────────── 문의 / 사고 접수 ───────────────────────

export const inquiryOpen: InquiryRes = make(inquirySchema, {
  id: 'inquiry-1',
  userId: userPersonal.id,
  vehicleId: vehicleAvante.id,
  rentalId: null,
  category: 'VEHICLE',
  body: '블루투스 연결이 되지 않습니다',
  status: 'OPEN',
  answer: null,
  answeredAt: null,
  createdAt: '2030-01-02T04:00:00.000Z',
});

export const inquiryAnswered: InquiryRes = make(inquirySchema, {
  ...inquiryOpen,
  id: 'inquiry-2',
  category: 'RETURN',
  body: '반납 후 정산 금액이 예상과 다릅니다',
  status: 'ANSWERED',
  answer: '주행 30km 초과분이 함께 청구되었습니다. 상세 내역을 메일로 보내드렸어요',
  answeredAt: '2030-01-02T05:00:00.000Z',
  createdAt: '2030-01-01T09:00:00.000Z',
});

/** 완전보장(FULL) 예약의 사고 접수 결과 — 자기부담금 0원 안내 */
export const incidentResultFull: IncidentResultRes = make(incidentResultSchema, {
  incident: {
    id: 'incident-1',
    rentalId: rentalInUse.id,
    description: '주차장에서 후진하다 뒤 범퍼가 기둥에 닿았습니다',
    status: 'RECEIVED',
    createdAt: '2030-01-02T02:00:00.000Z',
    photos: [storedPhoto('photo-incident-1')],
  },
  insurance: {
    tier: 'FULL',
    label: INSURANCE_META.FULL.label,
    deductibleKrw: INSURANCE_META.FULL.deductibleKrw,
    description: INSURANCE_META.FULL.description,
  },
  insurer: {
    name: MOCK_INSURER.name,
    phone: MOCK_INSURER.phone,
    steps: [...MOCK_INSURER.steps],
  },
});
