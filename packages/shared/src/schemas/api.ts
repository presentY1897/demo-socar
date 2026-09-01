import { z } from 'zod';
import { conditionPhaseSchema } from './condition';
import { storedPhotoSchema } from './photo';
import { insuranceTierSchema } from './reservation';

/**
 * API 응답 계약 — 웹/테스트가 공유하는 단일 소스.
 *
 * 프론트 테스트의 MSW 목 서버는 여기서 파생한 픽스처를 쓰고, 응답을 만들 때
 * 반드시 `parse`를 통과시킨다. 그래서 API가 계약을 바꾸면(필드 이름/타입)
 * 목 응답이 먼저 깨지고, 실제 계약과 어긋난 채로 프론트 테스트가 통과하는 일이 없다.
 */

export const fuelTypeSchema = z.enum(['EV', 'GASOLINE', 'HYBRID']);
export const vehicleStatusSchema = z.enum(['AVAILABLE', 'MAINTENANCE']);
export const reservationStatusSchema = z.enum(['CONFIRMED', 'IN_USE', 'COMPLETED', 'CANCELED']);
export const rentalStatusSchema = z.enum(['IN_USE', 'RETURN_PENDING', 'COMPLETED']);
export const roleSchema = z.enum(['USER', 'CORP_MEMBER', 'CORP_ADMIN', 'OPS_ADMIN']);
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

/**
 * `GET /rentals/:id/usage` — 단계형 화면이 "지금 어느 단계인가"를 판단하는 단일 소스.
 * 단계별로 최신 보고 1건만 유효 보고로 본다 (m1-3 문서의 재제출 정책 참고).
 */
export const rentalUsageSchema = z.object({
  rentalId: z.string(),
  checkIn: conditionReportSchema.nullable(),
  checkOut: conditionReportSchema.nullable(),
});
export type RentalUsageRes = z.infer<typeof rentalUsageSchema>;

// ─────────────────────────── 계정 / 혜택 ───────────────────────────

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  corporationId: z.string().nullable(),
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
