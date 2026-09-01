import {
  authUserSchema,
  handlerQueueSchema,
  handlerTaskSchema,
  conditionReportSchema,
  corpMemberSchema,
  couponSchema,
  paymentSchema,
  fleetListSchema,
  fleetVehicleDetailSchema,
  opsAccountingSummarySchema,
  opsAlertSchema,
  opsFleetDetailSchema,
  handlerCandidateSchema,
  metricsDailyRowSchema,
  metricsSummarySchema,
  liveVehicleSchema,
  liveVehiclesEventSchema,
  opsFleetVehicleSchema,
  opsInquirySchema,
  opsLeaseSchema,
  opsOverviewSchema,
  opsUserDetailSchema,
  opsUserRiskSchema,
  opsZoneSchema,
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
  type HandlerQueueRes,
  type HandlerTaskRes,
  type IncidentResultRes,
  type HandlerCandidateRes,
  type InquiryRes,
  type LiveVehiclesEvent,
  type MetricsDailyRowRes,
  type OpsAlertRes,
  type OpsFleetVehicleRes,
  type OpsInquiryRes,
  type OpsUserRiskRes,
  type OpsZoneRes,
  type PricingPlanRes,
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
  email: 'admin@demo.mocar.kr',
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

// ─────────────────── 비즈니스(법인) 멤버 · 등급 ───────────────────

/** `GET /biz/members` — MANAGER(박배차) 시점의 법인 멤버 4종 */
const member = (user: typeof userCorpViewer, createdAt: string) =>
  make(corpMemberSchema, {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    corpGrade: user.corpGrade,
    createdAt,
    isSelf: user.id === userCorpAdmin.id,
  });

export const corpMembers = [
  member(userCorpAdmin, '2029-01-01T00:00:00.000Z'),
  member(userCorpMember, '2029-02-01T00:00:00.000Z'),
  member(userCorpApprover, '2029-03-01T00:00:00.000Z'),
  member(userCorpViewer, '2029-04-01T00:00:00.000Z'),
];

// ─────────────────── 비즈니스(법인) 플릿 · 리스 ───────────────────

/** 만기 임박(D-12) 계약 — 화면의 강조 케이스 */
const leaseIoniq = {
  id: 'lease-ioniq',
  corporationId: 'corp-1',
  vehicleId: 'veh-corp-ioniq',
  monthlyFeeKrw: 690000,
  startAt: '2029-03-01T00:00:00.000Z',
  endAt: '2030-01-14T00:00:00.000Z',
  status: 'ACTIVE',
  dDay: 12,
  expiringSoon: true,
  endedAt: null,
  requestedAt: null,
  requestedEndAt: null,
  requestNote: null,
  requestedBy: null,
};

/** 연장 요청이 올라가 있는 계약 — 처리 대기 표시 케이스 */
const leaseCarnival = {
  ...leaseIoniq,
  id: 'lease-carnival',
  vehicleId: 'veh-corp-carnival',
  monthlyFeeKrw: 890000,
  endAt: '2030-08-31T00:00:00.000Z',
  dDay: 241,
  expiringSoon: false,
  status: 'EXTENSION_REQUESTED',
  requestedAt: '2030-01-01T00:00:00.000Z',
  requestedEndAt: '2031-08-31T00:00:00.000Z',
  requestNote: '내년까지 계속 사용합니다',
  requestedBy: { id: userCorpAdmin.id, name: userCorpAdmin.name },
};

const usageIoniq = {
  windowDays: 30,
  tripCount: 9,
  usedDays: 12,
  totalHours: 26.5,
  distanceKm: 412.4,
  utilizationPct: 40,
};

export const fleetList = make(fleetListSchema, {
  summary: {
    vehicleCount: 2,
    activeLeaseCount: 2,
    monthlyTotalKrw: 1580000,
    expiringSoonCount: 1,
    pendingRequestCount: 1,
  },
  items: [
    {
      id: 'veh-corp-ioniq',
      modelName: '아이오닉 5',
      plateNo: '00허 0001',
      fuel: 'EV',
      seats: 5,
      status: 'AVAILABLE',
      zone: { id: 'zone-corp', name: '데모컴퍼니 사옥 주차장' },
      lease: leaseIoniq,
      usage: usageIoniq,
    },
    {
      id: 'veh-corp-carnival',
      modelName: '카니발',
      plateNo: '00허 0002',
      fuel: 'GASOLINE',
      seats: 7,
      status: 'AVAILABLE',
      zone: { id: 'zone-corp', name: '데모컴퍼니 사옥 주차장' },
      lease: leaseCarnival,
      usage: { ...usageIoniq, tripCount: 4, usedDays: 5, utilizationPct: 16.7 },
    },
  ],
});

export const fleetVehicleDetail = make(fleetVehicleDetailSchema, {
  ...fleetList.items[0],
  contracts: [
    leaseIoniq,
    {
      ...leaseIoniq,
      id: 'lease-ioniq-prev',
      monthlyFeeKrw: 650000,
      startAt: '2027-09-01T00:00:00.000Z',
      endAt: '2029-03-01T00:00:00.000Z',
      status: 'ENDED',
      dDay: -320,
      expiringSoon: false,
      endedAt: '2029-03-01T00:00:00.000Z',
    },
  ],
  trips: [
    {
      id: 'trip-1',
      startAt: '2029-12-28T01:00:00.000Z',
      endAt: '2029-12-28T04:00:00.000Z',
      returnedAt: '2029-12-28T04:10:00.000Z',
      status: 'COMPLETED',
      distanceKm: 42.5,
      lateMinutes: 10,
      user: { id: userCorpMember.id, name: userCorpMember.name },
      purpose: '판교 거래처 미팅',
    },
    {
      id: 'trip-2',
      startAt: '2029-12-20T02:00:00.000Z',
      endAt: '2029-12-20T05:00:00.000Z',
      returnedAt: '2029-12-20T05:00:00.000Z',
      status: 'COMPLETED',
      distanceKm: 18,
      lateMinutes: 0,
      user: { id: userCorpApprover.id, name: userCorpApprover.name },
      purpose: null,
    },
  ],
  memberUsage: [
    { id: userCorpMember.id, name: userCorpMember.name, tripCount: 6, totalHours: 18, distanceKm: 300.4 },
    { id: userCorpApprover.id, name: userCorpApprover.name, tripCount: 3, totalHours: 8.5, distanceKm: 112 },
  ],
});

/** `GET /ops/leases` — 처리 대기가 먼저 */
export const opsLeases = [
  make(opsLeaseSchema, {
    ...leaseCarnival,
    vehicle: { id: 'veh-corp-carnival', modelName: '카니발', plateNo: '00허 0002' },
    corporation: { id: 'corp-1', name: '주식회사 데모컴퍼니' },
  }),
  make(opsLeaseSchema, {
    ...leaseIoniq,
    vehicle: { id: 'veh-corp-ioniq', modelName: '아이오닉 5', plateNo: '00허 0001' },
    corporation: { id: 'corp-1', name: '주식회사 데모컴퍼니' },
  }),
];
// ─────────────────────── 핸들러 작업 (M2-5) ───────────────────────

/** 기한/완료 시각은 화면이 "오늘"을 판정하므로 렌더 시점 기준으로 만든다 */
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();

/** 미배정 공개 작업 — 수락 버튼이 붙는다 */
export const taskDeliveryOpen = make(handlerTaskSchema, {
  id: 'task-delivery-open',
  type: 'DELIVERY',
  status: 'PENDING',
  reservationId: 'resv-delivery',
  vehicle: { id: vehicleIoniq.id, modelName: '아이오닉 5', plateNo: '11가1111', fuel: 'EV' },
  from: { zoneId: zoneGangnam.id, label: zoneGangnam.name, lat: zoneGangnam.lat, lng: zoneGangnam.lng },
  to: { zoneId: null, label: '회사 정문 앞', lat: 37.4995, lng: 127.0301 },
  assigneeId: null,
  assigneeName: null,
  dueAt: hoursFromNow(3),
  overdue: false,
  etaMinutes: 12,
  distanceMeters: 2400,
  assignedAt: null,
  startedAt: null,
  completedAt: null,
  canceledAt: null,
  cancelReason: null,
  completionNote: null,
  createdAt: hoursFromNow(-2),
});

/** 내게 배정된 오늘 작업 — 기한이 지나 지연 표시가 붙는다 */
export const taskRetrieveMine = make(handlerTaskSchema, {
  ...taskDeliveryOpen,
  id: 'task-retrieve-mine',
  type: 'RETRIEVE',
  status: 'ASSIGNED',
  from: { zoneId: null, label: '회사 정문 앞', lat: 37.4995, lng: 127.0301 },
  to: { zoneId: zoneGangnam.id, label: zoneGangnam.name, lat: zoneGangnam.lat, lng: zoneGangnam.lng },
  assigneeId: 'user-handler',
  assigneeName: '한기사',
  dueAt: hoursFromNow(-1),
  overdue: true,
  assignedAt: hoursFromNow(-2),
  etaMinutes: 9,
});

/** 내 예정 작업 (내일) */
export const taskRepositionUpcoming = make(handlerTaskSchema, {
  ...taskDeliveryOpen,
  id: 'task-reposition-upcoming',
  type: 'REPOSITION',
  status: 'ASSIGNED',
  reservationId: null,
  to: { zoneId: zoneYeoksam.id, label: zoneYeoksam.name, lat: zoneYeoksam.lat, lng: zoneYeoksam.lng },
  assigneeId: 'user-handler',
  assigneeName: '한기사',
  dueAt: hoursFromNow(26),
  assignedAt: hoursFromNow(-1),
  etaMinutes: 7,
});

/** 오늘 끝낸 작업 (이력 탭) */
export const taskDoneToday = make(handlerTaskSchema, {
  ...taskRepositionUpcoming,
  id: 'task-done-today',
  status: 'DONE',
  dueAt: hoursFromNow(-4),
  assignedAt: hoursFromNow(-5),
  startedAt: hoursFromNow(-5),
  completedAt: hoursFromNow(-3),
  completionNote: '지하 2층 B-14 주차 완료',
  etaMinutes: null,
  distanceMeters: null,
});

/** 사흘 전 끝낸 작업 (이번 주 탭) */
export const taskDoneThisWeek = make(handlerTaskSchema, {
  ...taskDoneToday,
  id: 'task-done-week',
  completedAt: hoursFromNow(-72),
});

export const handlerQueue = make(handlerQueueSchema, {
  today: [taskRetrieveMine],
  upcoming: [taskRepositionUpcoming],
  open: [taskDeliveryOpen],
  done: [taskDoneToday, taskDoneThisWeek],
});

export const handlerTasksById: Record<string, HandlerTaskRes> = Object.fromEntries(
  [taskDeliveryOpen, taskRetrieveMine, taskRepositionUpcoming, taskDoneToday, taskDoneThisWeek].map(
    (t) => [t.id, t],
  ),
);

export const emptyHandlerQueue: HandlerQueueRes = { today: [], upcoming: [], open: [], done: [] };

export const userHandler = make(authUserSchema, {
  id: 'user-handler',
  email: 'handler@demo.mocar.kr',
  name: '한기사',
  role: 'HANDLER',
  corporationId: null,
  corpGrade: null,
});

// ═════════════════════ 운영 센터 /ops (M3-3 · 화면은 M3-4~6) ═════════════════════
// 백엔드는 M3-3에서 끝났고 화면은 다음 작업이다. 픽스처와 기본 핸들러를 미리 두어
// M3-4~6이 목 작성부터 시작하지 않게 한다. 값은 시드 데모 케이스를 본떴다
// (연료 부족 1대 · 보험 만기 임박 1대 · 계약 만료 임박 1존 · 지연 반납 진행 중 1건).

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString();

const telemetryOf = (over: Partial<{ fuelPct: number; odometerKm: number; lat: number; lng: number }> = {}) => ({
  fuelPct: 68,
  odometerKm: 24310.5,
  doorLocked: true,
  engineOn: false,
  lat: zoneGangnam.lat,
  lng: zoneGangnam.lng,
  updatedAt: hoursFromNow(-0.2),
  ...over,
});

/** 대기 중 — 표의 기본 행 */
export const opsFleetIdle = make(opsFleetVehicleSchema, {
  id: vehicleAvante.id,
  modelName: vehicleAvante.modelName,
  plateNo: vehicleAvante.plateNo,
  fuel: 'GASOLINE',
  seats: 5,
  status: 'AVAILABLE',
  state: 'IDLE',
  corporationId: null,
  zone: { id: zoneGangnam.id, name: zoneGangnam.name },
  telemetry: telemetryOf(),
  lowFuel: false,
  nextReservation: {
    id: 'resv-1',
    startAt: hoursFromNow(4),
    endAt: hoursFromNow(8),
    userName: '김소카',
  },
  insurance: {
    insurerName: '모카손해보험',
    expiresAt: daysFromNow(210),
    dDay: 210,
    expiringSoon: false,
  },
});

/** 운행 중 + 연료 부족 — 경고 피드와 이어지는 행 */
export const opsFleetLowFuel = make(opsFleetVehicleSchema, {
  ...opsFleetIdle,
  id: vehicleIoniq.id,
  modelName: vehicleIoniq.modelName,
  plateNo: vehicleIoniq.plateNo,
  fuel: 'EV',
  state: 'IN_USE',
  telemetry: telemetryOf({ fuelPct: 12.4, odometerKm: 41022.8, lat: 37.503, lng: 127.031 }),
  lowFuel: true,
  insurance: {
    insurerName: '한빛화재해상',
    expiresAt: daysFromNow(18),
    dDay: 18,
    expiringSoon: true,
  },
});

/** 정비 중 — 상태 필터가 실제로 갈리는지 보려면 세 번째 상태가 필요하다 */
export const opsFleetMaintenance = make(opsFleetVehicleSchema, {
  ...opsFleetIdle,
  id: 'veh-maintenance',
  modelName: '레이',
  plateNo: '56다 7890',
  status: 'MAINTENANCE',
  state: 'MAINTENANCE',
  nextReservation: null,
  telemetry: telemetryOf({ fuelPct: 44 }),
});

export const opsFleet: OpsFleetVehicleRes[] = [opsFleetIdle, opsFleetLowFuel, opsFleetMaintenance];

export const opsFleetDetail = make(opsFleetDetailSchema, {
  ...opsFleetLowFuel,
  finance: {
    acquisitionType: 'LEASE',
    acquisitionCostKrw: null,
    monthlyLeaseKrw: 450000,
    acquiredAt: daysFromNow(-400),
    insurerName: '한빛화재해상',
    insurancePremiumKrw: 52000,
    insuranceExpiresAt: daysFromNow(18),
    insuranceDDay: 18,
    insuranceExpiringSoon: true,
  },
  controlLogs: [
    { id: 'log-2', action: 'IGNITION_ON', at: hoursFromNow(-1.5), rentalId: 'rental-in-use' },
    { id: 'log-1', action: 'UNLOCK', at: hoursFromNow(-1.6), rentalId: 'rental-in-use' },
  ],
  maintenanceNotes: [
    { id: 'note-1', body: '앞 타이어 편마모 확인 — 정비소 입고 예정', authorName: '최운영', createdAt: hoursFromNow(-20) },
  ],
});

export const opsFleetById: Record<string, typeof opsFleetDetail> = {
  [opsFleetDetail.id]: opsFleetDetail,
};

/**
 * SSE `/metrics/vehicles/live` 의 한 틱 (M3-2, 5초 주기).
 * 운행 중 차량은 틱마다 좌표가 움직인다 — 지도 갱신 테스트가 좌표를 바꿔 넣는다.
 */
export const liveVehicleInUse = make(liveVehicleSchema, {
  id: vehicleIoniq.id,
  modelName: vehicleIoniq.modelName,
  plateNo: vehicleIoniq.plateNo,
  fuel: 'EV',
  zone: {
    name: zoneGangnam.name,
    region: zoneGangnam.region,
    lat: zoneGangnam.lat,
    lng: zoneGangnam.lng,
  },
  state: 'IN_USE',
  activeSince: hoursFromNow(-1.6),
  dueBack: hoursFromNow(0.5),
  telemetry: telemetryOf({ fuelPct: 12.4, lat: 37.503, lng: 127.031 }),
});

export const liveTick = (over: { lat?: number; lng?: number } = {}): LiveVehiclesEvent =>
  make(liveVehiclesEventSchema, {
    ts: new Date().toISOString(),
    vehicles: [
      { ...liveVehicleInUse, telemetry: { ...liveVehicleInUse.telemetry, ...over } },
    ],
  });

export const opsOverview = make(opsOverviewSchema, {
  vehicleCount: 3,
  inUseCount: 1,
  inTransitCount: 0,
  idleCount: 1,
  maintenanceCount: 1,
  todayReservationCount: 4,
  unassignedTaskCount: 2,
  openInquiryCount: 2,
  alertCount: 4,
});

export const opsAlerts: OpsAlertRes[] = [
  make(opsAlertSchema, {
    id: 'LATE_RETURN:user-personal',
    kind: 'LATE_RETURN',
    severity: 'danger',
    title: '김소카님 반납 1시간 35분 지연',
    detail: '아이오닉 5 34나 5678 — 반납 예정 시각이 지났는데 아직 이용 중입니다',
    tab: 'customers',
    targetId: 'user-personal',
    at: hoursFromNow(-1.6),
    dDay: null,
  }),
  make(opsAlertSchema, {
    id: `LOW_FUEL:${vehicleIoniq.id}`,
    kind: 'LOW_FUEL',
    severity: 'warn',
    title: '아이오닉 5 34나 5678 배터리 12%',
    detail: '배터리가 12% 남았어요 — 충전이 필요합니다',
    tab: 'fleet',
    targetId: vehicleIoniq.id,
    at: null,
    dDay: null,
  }),
  make(opsAlertSchema, {
    id: `INSURANCE_EXPIRING:${vehicleIoniq.id}`,
    kind: 'INSURANCE_EXPIRING',
    severity: 'warn',
    title: '아이오닉 5 34나 5678 보험 D-18',
    detail: '한빛화재해상 보험이 만료됩니다',
    tab: 'fleet',
    targetId: vehicleIoniq.id,
    at: daysFromNow(18),
    dDay: 18,
  }),
  make(opsAlertSchema, {
    id: `CONTRACT_EXPIRING:${zoneGangnam.id}`,
    kind: 'CONTRACT_EXPIRING',
    severity: 'warn',
    title: '강남역 공영주차장 계약 D-12',
    detail: '하이파킹과의 주차장 계약이 만료됩니다',
    tab: 'zones',
    targetId: zoneGangnam.id,
    at: daysFromNow(12),
    dDay: 12,
  }),
];

/** 유료 계약 + 만료 임박 + 잔여 자리 넉넉 */
export const opsZonePaid = make(opsZoneSchema, {
  ...zoneGangnam,
  assignedCount: 2,
  freeSlots: 10,
  contract: {
    isPaid: true,
    partnerName: '하이파킹',
    monthlyFeeKrw: 250000,
    contractStart: daysFromNow(-350),
    contractEnd: daysFromNow(12),
    dDay: 12,
    expiringSoon: true,
  },
});

/** 무료 존 + 잔여 0 (화면이 경고를 띄워야 하는 행) */
export const opsZoneFull = make(opsZoneSchema, {
  ...zoneYeoksam,
  assignedCount: 6,
  freeSlots: 0,
  contract: {
    isPaid: false,
    partnerName: null,
    monthlyFeeKrw: 0,
    contractStart: null,
    contractEnd: null,
    dDay: null,
    expiringSoon: false,
  },
});

export const opsZones: OpsZoneRes[] = [opsZonePaid, opsZoneFull];

export const opsUserRisky = make(opsUserRiskSchema, {
  id: userPersonal.id,
  name: userPersonal.name,
  email: userPersonal.email,
  role: 'USER',
  lateReturnCount: 3,
  incidentCount: 1,
  paymentFailCount: 2,
  riskScore: 10,
  lastLateAt: hoursFromNow(-30),
});

export const opsUsersRisk: OpsUserRiskRes[] = [opsUserRisky];

export const opsUserDetail = make(opsUserDetailSchema, {
  ...opsUserRisky,
  recentReservations: [
    {
      id: 'resv-past-1',
      startAt: hoursFromNow(-30),
      endAt: hoursFromNow(-26),
      status: 'COMPLETED',
      vehicle: { modelName: '아반떼', plateNo: '12가 3456' },
      lateMinutes: 45,
      distanceKm: 32.4,
    },
  ],
  recentIncidents: [
    {
      id: 'incident-1',
      rentalId: 'rental-past-1',
      description: '주차 중 우측 후방 범퍼 접촉',
      status: 'PROCESSING',
      createdAt: hoursFromNow(-28),
    },
  ],
});

export const opsInquiryPending = make(opsInquirySchema, {
  ...inquiryOpen,
  user: { id: userPersonal.id, name: userPersonal.name, email: userPersonal.email },
  vehicle: { id: vehicleAvante.id, modelName: vehicleAvante.modelName, plateNo: vehicleAvante.plateNo },
  answeredBy: null,
});

export const opsInquiryDone = make(opsInquirySchema, {
  ...inquiryAnswered,
  user: { id: userPersonal.id, name: userPersonal.name, email: userPersonal.email },
  vehicle: null,
  answeredBy: { id: 'user-ops', name: '최운영' },
});

export const opsInquiries: OpsInquiryRes[] = [opsInquiryPending, opsInquiryDone];

/**
 * `GET /ops/tasks` — 운영 작업 목록 (기한 오름차순, 상태 섞임).
 * 핸들러 큐 픽스처를 그대로 쓰면 "미배정 / 진행 중 / 오늘 완료"가 한 배열에 다 있다.
 */
export const opsTasks: HandlerTaskRes[] = [
  taskRetrieveMine, // ASSIGNED (기한 지남)
  taskDeliveryOpen, // PENDING — 배정 대상
  taskRepositionUpcoming, // ASSIGNED (내일)
  taskDoneToday, // DONE — 핸들러별 오늘 처리량
];

/** 미배정 작업 하나 더 — 큐가 한 줄만 있으면 정렬이 보이지 않는다 */
export const opsTaskPendingLate = make(handlerTaskSchema, {
  ...taskDeliveryOpen,
  id: 'task-reposition-open',
  type: 'REPOSITION',
  reservationId: null,
  to: { zoneId: zoneYeoksam.id, label: zoneYeoksam.name, lat: zoneYeoksam.lat, lng: zoneYeoksam.lng },
  dueAt: hoursFromNow(6),
});

/** `GET /ops/tasks/:id/candidates` — 마지막 완료 지점에서 가까운 순 */
export const opsCandidates: HandlerCandidateRes[] = [
  make(handlerCandidateSchema, {
    handlerId: 'user-handler',
    name: '한기사',
    lastCompletedAt: hoursFromNow(-3),
    lastPlaceLabel: zoneGangnam.name,
    distanceMeters: 400,
    activeTaskCount: 1,
    reasons: ['강남역 공영주차장에서 0.4km', '진행 중 작업 1건'],
  }),
  make(handlerCandidateSchema, {
    handlerId: 'user-handler-2',
    name: '이기사',
    lastCompletedAt: hoursFromNow(-20),
    lastPlaceLabel: zoneYeoksam.name,
    distanceMeters: 1200,
    activeTaskCount: 0,
    reasons: ['역삼역 주차장에서 1.2km', '지금 맡은 작업 없음'],
  }),
  make(handlerCandidateSchema, {
    handlerId: 'user-handler-3',
    name: '박기사',
    lastCompletedAt: null,
    lastPlaceLabel: null,
    distanceMeters: null,
    activeTaskCount: 0,
    reasons: ['완주 기록이 없어 거리를 알 수 없음'],
  }),
];

/** `GET /metrics/summary` · `GET /metrics/daily` — 회계 탭 전용 지표 */
export const metricsSummary = make(metricsSummarySchema, {
  days: 30,
  vehicleCount: 73,
  reservationCount: 142,
  revenueKrw: 4_120_000,
  utilizationPct: 38.4,
  lateReturnPct: 12.5,
  activeRentals: 3,
  rentalsByStatus: { IN_USE: 3, COMPLETED: 118 },
});

export const metricsDaily: MetricsDailyRowRes[] = Array.from({ length: 14 }, (_, i) =>
  make(metricsDailyRowSchema, {
    day: `2030-01-${String(i + 1).padStart(2, '0')}`,
    reservations: 4 + (i % 5),
    revenueKrw: 120_000 + i * 10_000,
  }),
);

/** `GET /ops/plans` — 차량 등록 폼의 요금제 셀렉트 (시간당 요금 오름차순) */
export const opsPlans: PricingPlanRes[] = [planStandard, planEv];

export const opsAccountingSummary = make(opsAccountingSummarySchema, {
  days: 30,
  revenue: { rentalKrw: 4_120_000, leaseKrw: 1_580_000, totalKrw: 5_700_000 },
  cost: {
    vehicleLeaseKrw: 2_050_000,
    insuranceKrw: 820_000,
    zoneContractKrw: 1_250_000,
    totalKrw: 4_120_000,
  },
  profitKrw: 1_580_000,
  marginPct: 27.7,
  counts: { vehicleCount: 73, leasedVehicleCount: 25, paidZoneCount: 20, activeLeaseCount: 2 },
});
