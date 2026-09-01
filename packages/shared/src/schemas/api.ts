import { z } from 'zod';
import { conditionPhaseSchema } from './condition';
import { handlerTaskStatusSchema, handlerTaskTypeSchema } from './handler-task';
import { vehicleControlActionSchema } from './control';
import { incidentStatusSchema, insuranceCoverageSchema } from './incident';
import { inquiryCategorySchema, inquiryStatusSchema } from './inquiry';
import { storedPhotoSchema } from './photo';
import { corpGradeSchema } from '../corp/grade';
import { leaseStatusSchema } from '../corp/lease';
import { opsAlertKindSchema, opsAlertSeveritySchema, opsTabSchema } from './ops';
import { insuranceTierSchema } from './reservation';
import { opsVehicleStateSchema } from './telemetry';

/**
 * API 응답 계약 — 웹/테스트가 공유하는 단일 소스.
 *
 * 프론트 테스트의 MSW 목 서버는 여기서 파생한 픽스처를 쓰고, 응답을 만들 때
 * 반드시 `parse`를 통과시킨다. 그래서 API가 계약을 바꾸면(필드 이름/타입)
 * 목 응답이 먼저 깨지고, 실제 계약과 어긋난 채로 프론트 테스트가 통과하는 일이 없다.
 */

export const fuelTypeSchema = z.enum(['EV', 'GASOLINE', 'HYBRID']);
export type FuelTypeValue = z.infer<typeof fuelTypeSchema>;
export const vehicleStatusSchema = z.enum(['AVAILABLE', 'MAINTENANCE']);
export const reservationStatusSchema = z.enum(['CONFIRMED', 'IN_USE', 'COMPLETED', 'CANCELED']);
export const rentalStatusSchema = z.enum(['IN_USE', 'RETURN_PENDING', 'COMPLETED']);
export const roleSchema = z.enum(['USER', 'CORP_MEMBER', 'CORP_ADMIN', 'OPS_ADMIN', 'HANDLER']);
export const paymentKindSchema = z.enum(['UPFRONT', 'DRIVE_SETTLEMENT', 'PENALTY']);
export const paymentStatusSchema = z.enum([
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
]);

// ─────────────────────────── 존 ───────────────────────────

/** `GET /zones` 의 원소 — 지도 마커가 쓰는 최소 형태 */
export const zoneMarkerSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  capacity: z.number().int(),
  corporationId: z.string().nullable(),
  vehicleCount: z.number().int(),
});
export type ZoneMarkerRes = z.infer<typeof zoneMarkerSchema>;

export const pricingPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseHourlyKrw: z.number().int(),
  weekendHourlyKrw: z.number().int(),
  perKmKrw: z.number().int(),
  insuranceLightKrw: z.number().int(),
  insuranceStandardKrw: z.number().int(),
  insuranceFullKrw: z.number().int(),
});
export type PricingPlanRes = z.infer<typeof pricingPlanSchema>;

/** 존 상세/차량 상세가 공유하는 차량 형태 */
export const vehicleSummarySchema = z.object({
  id: z.string(),
  modelName: z.string(),
  plateNo: z.string(),
  fuel: fuelTypeSchema,
  seats: z.number().int(),
  status: vehicleStatusSchema,
  imageUrl: z.string().nullable(),
  zoneId: z.string(),
  planId: z.string(),
  corporationId: z.string().nullable(),
  plan: pricingPlanSchema,
});
export type VehicleSummaryRes = z.infer<typeof vehicleSummarySchema>;

/** 이용 구간이 지정된 존 상세의 "바로 픽업" 차량 */
export const zoneVehicleSchema = vehicleSummarySchema.extend({
  estimatedRentalKrw: z.number().int(),
});

/** 같은 존 상세의 "부름으로 가져와 이용" 차량 */
export const deliverableVehicleSchema = zoneVehicleSchema.extend({
  fromZone: z.object({ id: z.string(), name: z.string() }),
  deliveryFeeEstimateKrw: z.number().int(),
  deliveryEtaMinutes: z.number().int(),
});

/** `GET /zones/:id?startAt&endAt` */
export const zoneDetailSchema = zoneMarkerSchema.omit({ vehicleCount: true }).extend({
  vehicles: z.array(zoneVehicleSchema),
  deliverable: z.array(deliverableVehicleSchema),
});
export type ZoneDetailRes = z.infer<typeof zoneDetailSchema>;

// ─────────────────────────── 차량 ───────────────────────────

/** `GET /vehicles/:id` — 존까지 포함 */
export const vehicleDetailSchema = vehicleSummarySchema.extend({
  zone: zoneMarkerSchema.omit({ vehicleCount: true }),
});

/** `GET /vehicles/:id/manual` — 차종별 모의 매뉴얼 (섹션 아코디언) */
export const vehicleManualSchema = z.object({
  vehicleId: z.string(),
  modelName: z.string(),
  plateNo: z.string(),
  fuel: fuelTypeSchema,
  tagline: z.string(),
  sections: z.array(z.object({ title: z.string(), body: z.string() })),
});
export type VehicleManualRes = z.infer<typeof vehicleManualSchema>;

/** `GET /vehicles/:id/availability?date=YYYY-MM-DD` */
export const availabilitySchema = z.object({
  date: z.string(),
  busy: z.array(z.object({ startAt: z.string(), endAt: z.string() })),
});

// ─────────────────────────── 요금 ───────────────────────────

/** `POST /reservations/quote` 의 요금 분해 */
export const quoteBreakdownSchema = z.object({
  slotCount: z.number().int(),
  rentalFeeKrw: z.number().int(),
  insuranceFeeKrw: z.number().int(),
  onewayFeeKrw: z.number().int(),
  deliveryFeeKrw: z.number().int(),
  discountKrw: z.number().int(),
  creditUsedKrw: z.number().int(),
  totalUpfrontKrw: z.number().int(),
});

// ─────────────────────────── 예약 / 대여 ───────────────────────────

export const rentalSchema = z.object({
  id: z.string(),
  reservationId: z.string(),
  status: rentalStatusSchema,
  startedAt: z.string(),
  returnedAt: z.string().nullable(),
  distanceKm: z.number().nullable(),
  lateMinutes: z.number().int(),
  driveFeeKrw: z.number().int().nullable(),
  lateFeeKrw: z.number().int().nullable(),
});

/** `GET /reservations/:id` 의 결제 이력 원소 */
export const paymentSchema = z.object({
  id: z.string(),
  reservationId: z.string(),
  kind: paymentKindSchema,
  amountKrw: z.number().int(),
  status: paymentStatusSchema,
  cardLast4: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** `GET /reservations/mine` 의 원소 · `GET /reservations/:id` 의 본문 */
export const reservationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  vehicleId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  status: reservationStatusSchema,
  insurance: insuranceTierSchema,
  returnZoneId: z.string().nullable(),
  deliveryLat: z.number().nullable(),
  deliveryLng: z.number().nullable(),
  deliveryLabel: z.string().nullable(),
  rentalFeeKrw: z.number().int(),
  insuranceFeeKrw: z.number().int(),
  onewayFeeKrw: z.number().int(),
  deliveryFeeKrw: z.number().int(),
  discountKrw: z.number().int(),
  creditUsedKrw: z.number().int(),
  totalUpfrontKrw: z.number().int(),
  createdAt: z.string(),
  canceledAt: z.string().nullable(),
  vehicle: vehicleSummarySchema.extend({
    zone: zoneMarkerSchema.omit({ vehicleCount: true }).optional(),
  }),
  returnZone: zoneMarkerSchema.omit({ vehicleCount: true }).nullable().optional(),
  rental: rentalSchema.nullable().optional(),
  /** 상세에만 실린다 (목록은 결제 이력을 싣지 않는다) */
  payments: z.array(paymentSchema).optional(),
});
export type ReservationRes = z.infer<typeof reservationSchema>;

// ─────────────────── 이용 플로우 (체크인/아웃) ───────────────────

/** 제출된 차량 상태 보고 — 사진은 `<img src>`에 바로 물리는 data: URI로 내려온다 */
export const conditionReportSchema = z.object({
  id: z.string(),
  rentalId: z.string(),
  phase: conditionPhaseSchema,
  notes: z.string().nullable(),
  parkingNote: z.string().nullable(),
  createdAt: z.string(),
  photos: z.array(storedPhotoSchema),
});
export type ConditionReportRes = z.infer<typeof conditionReportSchema>;

/** 가상 스마트키가 보여주는 차량 상태 — 출처는 VehicleTelemetry (M3-1 이관 완료) */
export const smartKeyStateSchema = z.object({
  doorLocked: z.boolean(),
  engineOn: z.boolean(),
  lastAction: vehicleControlActionSchema.nullable(),
  lastActionAt: z.string().nullable(),
});
export type SmartKeyStateRes = z.infer<typeof smartKeyStateSchema>;

/** `POST /rentals/:id/control` — 조작 결과와 갱신된 상태 */
export const vehicleControlResultSchema = z.object({
  action: vehicleControlActionSchema,
  at: z.string(),
  state: smartKeyStateSchema,
});
export type VehicleControlResultRes = z.infer<typeof vehicleControlResultSchema>;

/**
 * `GET /rentals/:id/usage` — 단계형 화면이 "지금 어느 단계인가"를 판단하는 단일 소스.
 * 단계별로 최신 보고 1건만 유효 보고로 본다 (m1-3 문서의 재제출 정책 참고).
 */
export const rentalUsageSchema = z.object({
  rentalId: z.string(),
  checkIn: conditionReportSchema.nullable(),
  checkOut: conditionReportSchema.nullable(),
  smartKey: smartKeyStateSchema,
});
export type RentalUsageRes = z.infer<typeof rentalUsageSchema>;


// ─────────────────────── 차량 텔레메트리 (M3-2) ───────────────────────

/**
 * 조회 시점의 차량 센서 값.
 *
 * 저장값 그대로가 아니라 "저장값 + 경과 시간 계산"의 결과다 — 운행 중인 차는 조회할 때마다
 * 조금씩 움직이고 연료가 준다. 계산 규칙은 `apps/api/src/telemetry/telemetry-mock.ts` 한 곳에만 있다.
 */
export const vehicleTelemetrySchema = z.object({
  /** 내연은 연료, EV는 배터리 잔량 (%) — 라벨은 fuelGaugeLabel()이 갈라 준다 */
  fuelPct: z.number(),
  odometerKm: z.number(),
  doorLocked: z.boolean(),
  engineOn: z.boolean(),
  lat: z.number(),
  lng: z.number(),
  /** 이 값이 확정된 시각 (계산 기준점) */
  updatedAt: z.string(),
});
export type VehicleTelemetryRes = z.infer<typeof vehicleTelemetrySchema>;

/** SSE `/metrics/vehicles/live` 의 차량 1대 */
export const liveVehicleSchema = z.object({
  id: z.string(),
  modelName: z.string(),
  plateNo: z.string(),
  fuel: fuelTypeSchema,
  zone: z.object({
    name: z.string(),
    region: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  state: opsVehicleStateSchema,
  activeSince: z.string().nullable(),
  dueBack: z.string().nullable(),
  telemetry: vehicleTelemetrySchema,
});
export type LiveVehicleRes = z.infer<typeof liveVehicleSchema>;

/** SSE 한 틱의 페이로드 (5초 주기) */
export const liveVehiclesEventSchema = z.object({
  ts: z.string(),
  vehicles: z.array(liveVehicleSchema),
});
export type LiveVehiclesEvent = z.infer<typeof liveVehiclesEventSchema>;

// ─────────────────────────── 계정 / 혜택 ───────────────────────────

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  corporationId: z.string().nullable(),
  /** 법인 미소속(개인/운영)은 null */
  corpGrade: corpGradeSchema.nullable(),
});

/** `POST /auth/login` */
export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});

/** `GET /me/coupons` 의 원소 */
export const couponSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  discountKrw: z.number().int(),
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
});

/** `GET /me/credit` */
export const creditSchema = z.object({ balanceKrw: z.number().int() });

// ─────────────────────── 문의 / 사고 접수 ───────────────────────

/** `POST /inquiries` · `GET /me/inquiries` 의 원소 */
export const inquirySchema = z.object({
  id: z.string(),
  userId: z.string(),
  vehicleId: z.string().nullable(),
  rentalId: z.string().nullable(),
  category: inquiryCategorySchema,
  body: z.string(),
  status: inquiryStatusSchema,
  answer: z.string().nullable(),
  answeredAt: z.string().nullable(),
  createdAt: z.string(),
});
export type InquiryRes = z.infer<typeof inquirySchema>;

export const incidentReportSchema = z.object({
  id: z.string(),
  rentalId: z.string(),
  description: z.string(),
  status: incidentStatusSchema,
  createdAt: z.string(),
  photos: z.array(storedPhotoSchema),
});

/**
 * `POST /rentals/:id/incident` — 접수 결과 + 가입 면책상품 안내.
 * 사고 접수 직후 "내 자기부담금이 얼마인지"를 바로 보여주는 게 이 응답의 목적이다.
 */
export const incidentResultSchema = z.object({
  incident: incidentReportSchema,
  insurance: insuranceCoverageSchema,
  insurer: z.object({
    name: z.string(),
    phone: z.string(),
    steps: z.array(z.string()),
  }),
});
export type IncidentResultRes = z.infer<typeof incidentResultSchema>;
// ─────────────────────────── 비즈니스(법인) — 배차 ───────────────────────────

export const dispatchStatusSchema = z.enum([
  'REQUESTED',
  'RECOMMENDED',
  'APPROVED',
  'REJECTED',
  'CANCELED',
]);

/** `GET /biz/dispatch/requests` 원소의 추천 후보 */
export const dispatchCandidateSchema = z.object({
  id: z.string(),
  rank: z.number().int(),
  score: z.number(),
  isDedicated: z.boolean(),
  walkSeconds: z.number().int(),
  walkMeters: z.number().int(),
  bufferMinutes: z.number().int(),
  lateRiskPct: z.number(),
  reasons: z.array(z.string()),
  vehicle: z.object({
    id: z.string(),
    modelName: z.string(),
    plateNo: z.string(),
    zone: z.object({ name: z.string() }),
  }),
});
export type DispatchCandidateRes = z.infer<typeof dispatchCandidateSchema>;

/** `GET /biz/dispatch/requests` · `POST /biz/dispatch/requests` */
export const dispatchRequestSchema = z.object({
  id: z.string(),
  purpose: z.string(),
  desiredStartAt: z.string(),
  desiredEndAt: z.string(),
  status: dispatchStatusSchema,
  rejectReason: z.string().nullable(),
  requester: z.object({ name: z.string() }),
  candidates: z.array(dispatchCandidateSchema),
  reservation: z.object({ id: z.string(), status: z.string() }).nullable(),
});
export type DispatchRequestRes = z.infer<typeof dispatchRequestSchema>;

/** `GET /biz/dispatch/board?date=YYYY-MM-DD` — 차량 × 시간 타임라인 */
export const dispatchBoardSchema = z.object({
  date: z.string(),
  office: z.object({ name: z.string(), officeAddress: z.string() }),
  vehicles: z.array(
    z.object({
      id: z.string(),
      modelName: z.string(),
      plateNo: z.string(),
      zone: z.object({ name: z.string() }),
      reservations: z.array(
        z.object({
          id: z.string(),
          startAt: z.string(),
          endAt: z.string(),
          status: z.string(),
          user: z.object({ name: z.string() }),
          dispatch: z.object({ id: z.string(), purpose: z.string() }).nullable(),
        }),
      ),
    }),
  ),
  requests: z.array(
    z.object({
      id: z.string(),
      purpose: z.string(),
      status: dispatchStatusSchema,
      desiredStartAt: z.string(),
      desiredEndAt: z.string(),
      requester: z.object({ name: z.string() }),
    }),
  ),
});
export type DispatchBoardRes = z.infer<typeof dispatchBoardSchema>;

// ─────────────────────────── 비즈니스(법인) — 멤버 ───────────────────────────

/** `GET /biz/members` 의 원소 · `PATCH /biz/members/:id/grade` 응답 */
export const corpMemberSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  corpGrade: corpGradeSchema,
  createdAt: z.string(),
  /** 본인 행 — 자기 강등 금지 안내에 쓴다 */
  isSelf: z.boolean(),
});
export type CorpMemberRes = z.infer<typeof corpMemberSchema>;

// ───────────────── 비즈니스(법인) — 플릿 / 리스 계약 ─────────────────

/** 리스 계약 1건. D-day·임박 여부는 서버가 계산해 내려준다 (화면과 기준을 하나로) */
export const leaseContractSchema = z.object({
  id: z.string(),
  corporationId: z.string(),
  vehicleId: z.string(),
  monthlyFeeKrw: z.number().int(),
  startAt: z.string(),
  endAt: z.string(),
  status: leaseStatusSchema,
  /** 만기까지 남은 일수 (KST 달력 기준, 음수면 만기 지남) */
  dDay: z.number().int(),
  expiringSoon: z.boolean(),
  endedAt: z.string().nullable(),
  /** 진행 중이거나 마지막으로 처리된 연장/해지 요청의 흔적 */
  requestedAt: z.string().nullable(),
  requestedEndAt: z.string().nullable(),
  requestNote: z.string().nullable(),
  requestedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type LeaseContractRes = z.infer<typeof leaseContractSchema>;

/** 최근 N일 이용 집계 (shared summarizeUsage 결과) */
export const fleetUsageSchema = z.object({
  windowDays: z.number().int(),
  tripCount: z.number().int(),
  usedDays: z.number().int(),
  totalHours: z.number(),
  distanceKm: z.number(),
  utilizationPct: z.number(),
});

/** `GET /biz/fleet` 의 원소 — 법인 전용 차량 + 진행 중 계약 + 이용 현황 */
export const fleetVehicleSchema = z.object({
  id: z.string(),
  modelName: z.string(),
  plateNo: z.string(),
  fuel: fuelTypeSchema,
  seats: z.number().int(),
  status: vehicleStatusSchema,
  zone: z.object({ id: z.string(), name: z.string() }),
  lease: leaseContractSchema.nullable(),
  usage: fleetUsageSchema,
});
export type FleetVehicleRes = z.infer<typeof fleetVehicleSchema>;

/** `GET /biz/fleet` — 목록 + 계약 합계 */
export const fleetListSchema = z.object({
  summary: z.object({
    vehicleCount: z.number().int(),
    activeLeaseCount: z.number().int(),
    /** 진행 중 계약의 월 리스료 합계 */
    monthlyTotalKrw: z.number().int(),
    expiringSoonCount: z.number().int(),
    pendingRequestCount: z.number().int(),
  }),
  items: z.array(fleetVehicleSchema),
});
export type FleetListRes = z.infer<typeof fleetListSchema>;

/** 운행일지 1줄 (FMS 자동 기록 = 예약 + 대여) */
export const fleetTripSchema = z.object({
  id: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  returnedAt: z.string().nullable(),
  status: reservationStatusSchema,
  distanceKm: z.number().nullable(),
  lateMinutes: z.number().int(),
  user: z.object({ id: z.string(), name: z.string() }),
  /** 배차 요청으로 잡힌 예약이면 그 목적 */
  purpose: z.string().nullable(),
});

/** `GET /biz/fleet/:id` — 계약 이력 · 운행일지 · 이용 임직원 통계 */
export const fleetVehicleDetailSchema = fleetVehicleSchema.extend({
  contracts: z.array(leaseContractSchema),
  trips: z.array(fleetTripSchema),
  memberUsage: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      tripCount: z.number().int(),
      totalHours: z.number(),
      distanceKm: z.number(),
    }),
  ),
});
export type FleetVehicleDetailRes = z.infer<typeof fleetVehicleDetailSchema>;

/** `GET /biz/leases` — 차량 표기까지 붙인 계약 목록 */
export const bizLeaseSchema = leaseContractSchema.extend({
  vehicle: z.object({ id: z.string(), modelName: z.string(), plateNo: z.string() }),
});
export type BizLeaseRes = z.infer<typeof bizLeaseSchema>;

/** `GET /ops/leases` — 운영 어드민은 법인 표기가 더 필요하다 */
export const opsLeaseSchema = bizLeaseSchema.extend({
  corporation: z.object({ id: z.string(), name: z.string() }),
});
export type OpsLeaseRes = z.infer<typeof opsLeaseSchema>;


// ═══════════════════════ 운영 센터 (/ops · M3-3) ═══════════════════════

/** `GET /ops/overview` — 운영 홈 상단 스탯 */
export const opsOverviewSchema = z.object({
  vehicleCount: z.number().int(),
  inUseCount: z.number().int(),
  inTransitCount: z.number().int(),
  idleCount: z.number().int(),
  maintenanceCount: z.number().int(),
  /** 오늘(KST) 시작하는 예약 — 취소 제외 */
  todayReservationCount: z.number().int(),
  unassignedTaskCount: z.number().int(),
  openInquiryCount: z.number().int(),
  alertCount: z.number().int(),
});
export type OpsOverviewRes = z.infer<typeof opsOverviewSchema>;

/**
 * `GET /ops/alerts` 의 경고 1건.
 * 항목을 누르면 `tab`/`targetId`로 해당 탭의 그 행으로 간다 (M3-4).
 */
export const opsAlertSchema = z.object({
  /** `kind:targetId` — 목록 리렌더에서 안정적인 키 */
  id: z.string(),
  kind: opsAlertKindSchema,
  severity: opsAlertSeveritySchema,
  title: z.string(),
  detail: z.string(),
  tab: opsTabSchema,
  targetId: z.string(),
  /** 만기일·반납 예정 시각 등 관련 시각 */
  at: z.string().nullable(),
  /** 만기까지 남은 일수 (없는 종류는 null) */
  dDay: z.number().int().nullable(),
});
export type OpsAlertRes = z.infer<typeof opsAlertSchema>;

/** 차량 도입 원가·보험 (MOCAR가 쓴 돈 관점) */
export const opsVehicleFinanceSchema = z.object({
  acquisitionType: z.enum(['PURCHASE', 'LEASE']),
  acquisitionCostKrw: z.number().int().nullable(),
  monthlyLeaseKrw: z.number().int().nullable(),
  acquiredAt: z.string(),
  insurerName: z.string(),
  insurancePremiumKrw: z.number().int(),
  insuranceExpiresAt: z.string(),
  /** 보험 만기까지 남은 일수 — 서버가 계산해 내려준다 (화면과 기준을 하나로) */
  insuranceDDay: z.number().int(),
  insuranceExpiringSoon: z.boolean(),
});
export type OpsVehicleFinanceRes = z.infer<typeof opsVehicleFinanceSchema>;

/** `GET /ops/fleet` 의 원소 — 차량 표 한 줄 */
export const opsFleetVehicleSchema = z.object({
  id: z.string(),
  modelName: z.string(),
  plateNo: z.string(),
  fuel: fuelTypeSchema,
  seats: z.number().int(),
  status: vehicleStatusSchema,
  /** 대기/운행/탁송/정비 — 예약 가능 여부(status)와 다른 축이다 */
  state: opsVehicleStateSchema,
  corporationId: z.string().nullable(),
  zone: z.object({ id: z.string(), name: z.string() }),
  telemetry: vehicleTelemetrySchema,
  lowFuel: z.boolean(),
  nextReservation: z
    .object({
      id: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      userName: z.string(),
    })
    .nullable(),
  insurance: z
    .object({
      insurerName: z.string(),
      expiresAt: z.string(),
      dDay: z.number().int(),
      expiringSoon: z.boolean(),
    })
    .nullable(),
});
export type OpsFleetVehicleRes = z.infer<typeof opsFleetVehicleSchema>;

/** `GET /ops/fleet/:id` — 센서 상세 + 조작 이력 + 도입/보험 + 정비 메모 */
export const opsFleetDetailSchema = opsFleetVehicleSchema.extend({
  finance: opsVehicleFinanceSchema.nullable(),
  controlLogs: z.array(
    z.object({
      id: z.string(),
      action: vehicleControlActionSchema,
      at: z.string(),
      rentalId: z.string(),
    }),
  ),
  maintenanceNotes: z.array(
    z.object({
      id: z.string(),
      body: z.string(),
      authorName: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type OpsFleetDetailRes = z.infer<typeof opsFleetDetailSchema>;

/** `POST /ops/fleet/:id/notes` */
export const opsMaintenanceNoteSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  body: z.string(),
  authorName: z.string().nullable(),
  createdAt: z.string(),
});
export type OpsMaintenanceNoteRes = z.infer<typeof opsMaintenanceNoteSchema>;

/** `GET /ops/zones` · `PATCH /ops/zones/:id/contract` — 계약 + 자리 현황 */
export const opsZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  capacity: z.number().int(),
  corporationId: z.string().nullable(),
  /** 지금 이 존에 배정된 차량 수 */
  assignedCount: z.number().int(),
  /** 면수 − 배정 = 남은 자리 (음수는 0으로 보지 않고 그대로 — 초과 배정을 숨기지 않는다) */
  freeSlots: z.number().int(),
  contract: z
    .object({
      isPaid: z.boolean(),
      partnerName: z.string().nullable(),
      monthlyFeeKrw: z.number().int(),
      contractStart: z.string().nullable(),
      contractEnd: z.string().nullable(),
      dDay: z.number().int().nullable(),
      expiringSoon: z.boolean(),
    })
    .nullable(),
});
export type OpsZoneRes = z.infer<typeof opsZoneSchema>;

/** `GET /ops/users/risk` 의 원소 — 임계치를 넘은 유저만 실린다 */
export const opsUserRiskSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  lateReturnCount: z.number().int(),
  incidentCount: z.number().int(),
  paymentFailCount: z.number().int(),
  /** 정렬용 가중합 — 화면은 배지(횟수)를 보여준다 */
  riskScore: z.number(),
  lastLateAt: z.string().nullable(),
});
export type OpsUserRiskRes = z.infer<typeof opsUserRiskSchema>;

/** `GET /ops/users/:id` — 유저 클릭 시 여는 최근 예약/사고 이력 (M3-5) */
export const opsUserDetailSchema = opsUserRiskSchema.extend({
  recentReservations: z.array(
    z.object({
      id: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      status: reservationStatusSchema,
      vehicle: z.object({ modelName: z.string(), plateNo: z.string() }),
      lateMinutes: z.number().int(),
      distanceKm: z.number().nullable(),
    }),
  ),
  recentIncidents: z.array(
    z.object({
      id: z.string(),
      rentalId: z.string(),
      description: z.string(),
      status: incidentStatusSchema,
      createdAt: z.string(),
    }),
  ),
});
export type OpsUserDetailRes = z.infer<typeof opsUserDetailSchema>;

/** `GET /ops/inquiries` · `POST /ops/inquiries/:id/answer` — 문의함 */
export const opsInquirySchema = inquirySchema.extend({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  vehicle: z.object({ id: z.string(), modelName: z.string(), plateNo: z.string() }).nullable(),
  answeredBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type OpsInquiryRes = z.infer<typeof opsInquirySchema>;

/**
 * `GET /ops/accounting/summary` — 월 손익.
 *
 * 매출은 기간 집계(실제 결제), 비용은 **월 고정비**(리스료·보험료·주차장 계약비)라
 * 성격이 다르다. 그래서 기간(days)을 바꾸면 매출만 움직인다 — 화면이 이 점을 표기해야 한다.
 */
export const opsAccountingSummarySchema = z.object({
  days: z.number().int(),
  revenue: z.object({
    /** 이용 결제 (CAPTURED 합계) */
    rentalKrw: z.number().int(),
    /** 법인 리스 매출 — 진행 중 계약의 월 리스료 합계 */
    leaseKrw: z.number().int(),
    totalKrw: z.number().int(),
  }),
  cost: z.object({
    /** MOCAR가 내는 차량 월 리스료 */
    vehicleLeaseKrw: z.number().int(),
    insuranceKrw: z.number().int(),
    zoneContractKrw: z.number().int(),
    totalKrw: z.number().int(),
  }),
  profitKrw: z.number().int(),
  marginPct: z.number(),
  counts: z.object({
    vehicleCount: z.number().int(),
    leasedVehicleCount: z.number().int(),
    paidZoneCount: z.number().int(),
    activeLeaseCount: z.number().int(),
  }),
});
export type OpsAccountingSummaryRes = z.infer<typeof opsAccountingSummarySchema>;

/**
 * `GET /metrics/summary` — 회계 탭의 운영 지표 (M3-6에서 회계 전용으로 강등).
 * 손익(`/ops/accounting/summary`)과 달리 예약·가동률·지연 반납처럼 "얼마나 굴렸나"를 본다.
 */
export const metricsSummarySchema = z.object({
  days: z.number().int(),
  vehicleCount: z.number().int(),
  reservationCount: z.number().int(),
  revenueKrw: z.number().int(),
  utilizationPct: z.number(),
  lateReturnPct: z.number(),
  activeRentals: z.number().int(),
  rentalsByStatus: z.record(z.string(), z.number().int()),
});
export type MetricsSummaryRes = z.infer<typeof metricsSummarySchema>;

/** `GET /metrics/daily` 의 하루 — KST 달력 기준 */
export const metricsDailyRowSchema = z.object({
  day: z.string(),
  reservations: z.number().int(),
  revenueKrw: z.number().int(),
});
export type MetricsDailyRowRes = z.infer<typeof metricsDailyRowSchema>;

// ─────────────────────── 핸들러 작업 (M2-3 · M2-4) ───────────────────────

/**
 * 작업의 출발/도착 지점.
 * 존이면 `zoneId`가 실리고, 부름 수령지처럼 존이 아닌 곳이면 좌표와 라벨만 실린다 —
 * 작업 카드와 지도가 예약을 다시 조회하지 않고 "출발 → 도착"을 그릴 수 있는 형태다.
 */
export const taskPlaceSchema = z.object({
  zoneId: z.string().nullable(),
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type TaskPlaceRes = z.infer<typeof taskPlaceSchema>;

/** `GET /handler/tasks` · `GET /ops/tasks` 의 작업 1건 */
export const handlerTaskSchema = z.object({
  id: z.string(),
  type: handlerTaskTypeSchema,
  status: handlerTaskStatusSchema,
  reservationId: z.string().nullable(),
  vehicle: z.object({
    id: z.string(),
    modelName: z.string(),
    plateNo: z.string(),
    fuel: fuelTypeSchema,
  }),
  from: taskPlaceSchema,
  to: taskPlaceSchema,
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  dueAt: z.string(),
  /** 기한이 지났는데 아직 안 끝난 작업 — 서버와 화면이 같은 기준(isHandlerTaskOverdue)을 본다 */
  overdue: z.boolean(),
  /** 출발 → 도착 예상 이동 시간(A*). 완료된 이력에는 싣지 않는다 */
  etaMinutes: z.number().int().nullable(),
  distanceMeters: z.number().int().nullable(),
  assignedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  completionNote: z.string().nullable(),
  createdAt: z.string(),
  /** 완료 응답에만 실린다 — 목록에 base64 사진을 싣지 않기 위해서 */
  photos: z.array(storedPhotoSchema).optional(),
});
export type HandlerTaskRes = z.infer<typeof handlerTaskSchema>;

/**
 * `GET /handler/tasks` — 핸들러 화면 한 벌을 채우는 작업 큐.
 * 오늘/예정은 내 작업, `open`은 아직 주인이 없는 공개 작업, `done`은 최근 완료 이력이다.
 */
export const handlerQueueSchema = z.object({
  today: z.array(handlerTaskSchema),
  upcoming: z.array(handlerTaskSchema),
  open: z.array(handlerTaskSchema),
  done: z.array(handlerTaskSchema),
});
export type HandlerQueueRes = z.infer<typeof handlerQueueSchema>;

/**
 * `GET /ops/tasks/:id/candidates` — 이 작업을 맡길 핸들러 후보.
 * "마지막 완료 작업을 끝낸 위치 → 이 작업의 출발지" 거리순이고, 완주 기록이 없는 핸들러는
 * 거리를 알 수 없어 뒤에 기본 순서로 붙는다. 점수 대신 근거를 주고 판단은 운영자가 한다.
 */
export const handlerCandidateSchema = z.object({
  handlerId: z.string(),
  name: z.string(),
  lastCompletedAt: z.string().nullable(),
  lastPlaceLabel: z.string().nullable(),
  distanceMeters: z.number().int().nullable(),
  activeTaskCount: z.number().int(),
  reasons: z.array(z.string()),
});
export type HandlerCandidateRes = z.infer<typeof handlerCandidateSchema>;
