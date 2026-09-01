import {
  authUserSchema,
  conditionReportSchema,
  couponSchema,
  paymentSchema,
  dispatchRequestSchema,
  dispatchBoardSchema,
  pricingPlanSchema,
  rentalSchema,
  incidentResultSchema,
  inquirySchema,
  rentalUsageSchema,
  reservationSchema,
  smartKeyStateSchema,
  vehicleManualSchema,
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
  type VehicleManualRes,
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

/** 강남에서 800m — 편도 수수료가 최소 5,000원에 걸리는 거리 */
export const zoneYeoksam = make(zoneMarkerSchema, {
  id: 'zone-yeoksam',
  name: '역삼역 주차장',
  region: 'seoul',
  address: '서울 강남구 테헤란로 지하 156',
  lat: 37.5006,
  lng: 127.0365,
  capacity: 6,
  corporationId: null,
  vehicleCount: 1,
});

/** 강남에서 18km — 최소 수수료를 넘겨 거리 기반 요금(9,000원)이 나오는 존 */
export const zoneNowon = make(zoneMarkerSchema, {
  id: 'zone-nowon',
  name: '노원역 공영주차장',
  region: 'seoul',
  address: '서울 노원구 노해로 지하 437',
  lat: 37.6584,
  lng: 127.0605,
  capacity: 5,
  corporationId: null,
  vehicleCount: 0,
});

/** `GET /zones` 가 돌려주는 지도 마커 */
export const zoneMarkers: ZoneMarkerRes[] = [zoneGangnam, zoneSeomyeon];

/** 편도 반납 후보(`GET /zones/:id/return-zones`)까지 포함한 전체 존 */
export const allZones: ZoneMarkerRes[] = [zoneGangnam, zoneSeomyeon, zoneYeoksam, zoneNowon];

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

// ─────────────────────── 차종 매뉴얼 ───────────────────────

/** 내연기관 매뉴얼 — 주유/시동 문구가 EV와 달라야 한다 */
export const manualAvante = make(vehicleManualSchema, {
  vehicleId: vehicleAvante.id,
  modelName: vehicleAvante.modelName,
  plateNo: vehicleAvante.plateNo,
  fuel: 'GASOLINE',
  tagline: '준중형 세단 — 장거리 연비가 좋은 기본기 차량',
  sections: [
    { title: '시동 걸기 / 기어', body: '브레이크를 밟고 시동 버튼을 누릅니다.' },
    { title: '주유 · 충전', body: '주유구는 조수석 뒤편, 휘발유(가솔린)입니다.' },
    { title: '공조 · 편의 기능', body: '풀오토 공조라 온도만 맞춰두면 됩니다.' },
    { title: '이 차의 특징', body: '스마트 크루즈 컨트롤이 있어 고속도로 주행이 편합니다.' },
    { title: '반납 전 체크리스트', body: '① 연료 게이지 1/4 이상\n② 개인 물품 회수' },
  ],
});

/** 전기차 매뉴얼 — 같은 섹션 제목에 다른 본문 */
export const manualIoniq = make(vehicleManualSchema, {
  vehicleId: vehicleIoniq.id,
  modelName: vehicleIoniq.modelName,
  plateNo: vehicleIoniq.plateNo,
  fuel: 'EV',
  tagline: '전기 SUV — 급속 충전 18분(80%)의 장거리 EV',
  sections: [
    { title: '시동 걸기 / 기어', body: '브레이크를 밟으면 READY 표시가 뜹니다.' },
    { title: '주유 · 충전', body: '충전구는 조수석 뒤편입니다. 급속은 DC 콤보(CCS)를 씁니다.' },
    { title: '공조 · 편의 기능', body: '난방 대신 열선 시트를 먼저 쓰면 주행 거리를 아낄 수 있어요.' },
    { title: '이 차의 특징', body: 'V2L(차량 외부 급전)을 쓸 수 있습니다.' },
    { title: '반납 전 체크리스트', body: '① 배터리 잔량 30% 이상\n② 개인 물품 회수' },
  ],
});

export const vehicleManuals: Record<string, VehicleManualRes> = {
  [manualAvante.vehicleId]: manualAvante,
  [manualIoniq.vehicleId]: manualIoniq,
};

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
  corpGrade: null,
});

export const userCorpAdmin = make(authUserSchema, {
  id: 'user-corp-admin',
  email: 'corpadmin@demo.mocar.kr',
  name: '박배차',
  role: 'CORP_ADMIN',
  corporationId: 'corp-1',
  corpGrade: 'MANAGER',
});

export const userOpsAdmin = make(authUserSchema, {
  id: 'user-ops',
  email: 'ops@demo.mocar.kr',
  name: '이운영',
  role: 'OPS_ADMIN',
  corporationId: null,
  corpGrade: null,
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

/** 편도(강남 → 역삼) 예약 — 반납 존 변경/환급 흐름용 */
export const reservationOneway = make(reservationSchema, {
  ...reservationConfirmed,
  id: 'resv-oneway',
  returnZoneId: zoneYeoksam.id,
  returnZone: zoneYeoksam,
  onewayFeeKrw: 5000,
  totalUpfrontKrw: 27400,
});

/** 부름(탁송) 수령 예약 — 반납 존 변경이 막히는 케이스 */
export const reservationDelivery = make(reservationSchema, {
  ...reservationConfirmed,
  id: 'resv-delivery',
  deliveryLat: 37.4995,
  deliveryLng: 127.0301,
  deliveryLabel: '회사 정문 앞',
  deliveryFeeKrw: 6000,
  totalUpfrontKrw: 28400,
});

// ─────────────────── 비즈니스(법인) 배차 ───────────────────

export const userCorpMember = make(authUserSchema, {
  id: 'user-corp-member',
  email: 'member@demo.mocar.kr',
  name: '이직원',
  role: 'CORP_MEMBER',
  corporationId: 'corp-1',
  corpGrade: 'REQUESTER',
});

/** 결정 대기(RECOMMENDED) 요청 1건 — 담당자가 승인/반려할 수 있는 상태 */
/** 조회만 가능한 등급 — 등급별 분기 테스트용 */
export const userCorpViewer = make(authUserSchema, {
  id: 'user-corp-viewer',
  email: 'viewer@demo.mocar.kr',
  name: '한조회',
  role: 'CORP_MEMBER',
  corporationId: 'corp-1',
  corpGrade: 'VIEWER',
});

/** 역할은 임직원이지만 등급이 APPROVER — 권한이 Role이 아니라 등급에서 나온다 */
export const userCorpApprover = make(authUserSchema, {
  id: 'user-corp-approver',
  email: 'approver@demo.mocar.kr',
  name: '정승인',
  role: 'CORP_MEMBER',
  corporationId: 'corp-1',
  corpGrade: 'APPROVER',
});

export const dispatchRecommended = make(dispatchRequestSchema, {
  id: 'disp-1',
  purpose: '판교 거래처 미팅',
  desiredStartAt: '2030-01-02T01:00:00.000Z',
  desiredEndAt: '2030-01-02T03:00:00.000Z',
  status: 'RECOMMENDED',
  rejectReason: null,
  requester: { name: userCorpMember.name },
  candidates: [
    {
      id: 'cand-1',
      rank: 1,
      score: 87.5,
      isDedicated: true,
      walkSeconds: 180,
      walkMeters: 220,
      bufferMinutes: 45,
      lateRiskPct: 4.2,
      reasons: ['법인 전용 차량', '도보 3분'],
      vehicle: {
        id: vehicleAvante.id,
        modelName: vehicleAvante.modelName,
        plateNo: vehicleAvante.plateNo,
        zone: { name: '데모컴퍼니 사옥 주차장' },
      },
    },
  ],
  reservation: null,
});

export const dispatchBoard = make(dispatchBoardSchema, {
  date: '2030-01-02',
  office: { name: '주식회사 데모컴퍼니', officeAddress: '서울 성동구 성수이로 118' },
  vehicles: [
    {
      id: vehicleAvante.id,
      modelName: vehicleAvante.modelName,
      plateNo: vehicleAvante.plateNo,
      zone: { name: '데모컴퍼니 사옥 주차장' },
      reservations: [
        {
          id: 'resv-board-1',
          startAt: '2030-01-02T01:00:00.000Z',
          endAt: '2030-01-02T03:00:00.000Z',
          status: 'CONFIRMED',
          user: { name: userCorpMember.name },
          dispatch: { id: dispatchRecommended.id, purpose: dispatchRecommended.purpose },
        },
      ],
    },
  ],
  requests: [
    {
      id: dispatchRecommended.id,
      purpose: dispatchRecommended.purpose,
      status: dispatchRecommended.status,
      desiredStartAt: dispatchRecommended.desiredStartAt,
      desiredEndAt: dispatchRecommended.desiredEndAt,
      requester: { name: userCorpMember.name },
    },
  ],
});
