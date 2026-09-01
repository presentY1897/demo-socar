import { z } from 'zod';
import { leaseDDay } from '../corp/lease';

/**
 * 운영 센터(`/ops`)의 판정 규칙과 요청 DTO — API 가드와 백오피스 화면이 같은 값을 본다.
 *
 * 임계치를 여기 모으는 이유는 리스 만기(corp/lease.ts)와 같다: "API는 20%, 화면은 15%"처럼
 * 두 벌로 갈리는 순간 경고 피드가 거짓말을 하기 시작한다.
 */

// ─────────────────────────── 탭 ───────────────────────────

/** 운영 센터 탭 — 경고 항목을 눌렀을 때 어디로 데려갈지 (M3-4) */
export const opsTabSchema = z.enum([
  'home',
  'fleet',
  'dispatch',
  'zones',
  'customers',
  'accounting',
  'reports',
]);
export type OpsTab = z.infer<typeof opsTabSchema>;

export const OPS_TAB_LABEL: Record<OpsTab, string> = {
  home: '운영 홈',
  fleet: '차량',
  dispatch: '작업/배차',
  zones: '존/계약',
  customers: '고객',
  accounting: '회계',
  reports: '리포트',
};

// ─────────────────────────── 경고 ───────────────────────────

export const opsAlertKindSchema = z.enum([
  'LOW_FUEL', // 연료(배터리) 부족
  'INSURANCE_EXPIRING', // 보험 만기 임박
  'CONTRACT_EXPIRING', // 존 계약 만료 임박
  'LATE_RETURN', // 지연 반납 진행 중
]);
export type OpsAlertKind = z.infer<typeof opsAlertKindSchema>;

export const opsAlertSeveritySchema = z.enum(['warn', 'danger']);
export type OpsAlertSeverity = z.infer<typeof opsAlertSeveritySchema>;

/**
 * 경고 종류별 표기와 목적지 탭.
 * `danger`는 "지금 사람이 움직여야 하는 것", `warn`은 "이번 주에 처리하면 되는 것".
 */
export const OPS_ALERT_META: Record<
  OpsAlertKind,
  { label: string; tab: OpsTab; severity: OpsAlertSeverity }
> = {
  LOW_FUEL: { label: '연료 부족', tab: 'fleet', severity: 'warn' },
  INSURANCE_EXPIRING: { label: '보험 만기 임박', tab: 'fleet', severity: 'warn' },
  CONTRACT_EXPIRING: { label: '계약 만료 임박', tab: 'zones', severity: 'warn' },
  LATE_RETURN: { label: '지연 반납 진행 중', tab: 'customers', severity: 'danger' },
};

/** 연료(EV는 배터리) 부족 경고 임계 */
export const LOW_FUEL_PCT = 20;
/** 만기 임박 경고 임계 — 보험·존 계약 공통 */
export const EXPIRING_SOON_DAYS = 30;

export const isLowFuel = (fuelPct: number): boolean => fuelPct < LOW_FUEL_PCT;

/**
 * 만기까지 남은 일수. 리스 만기(leaseDDay)와 같은 **KST 달력 기준** 계산을 그대로 쓴다 —
 * 같은 화면에 리스 D-day와 보험 D-day가 나란히 놓이는데 기준이 다르면 안 된다.
 */
export const expiryDDay = leaseDDay;

/** 만기 임박 여부 — 이미 지난 것(음수)도 임박으로 본다 */
export const isExpiringSoon = (dDay: number): boolean => dDay <= EXPIRING_SOON_DAYS;

// ─────────────────────────── 유의 유저 ───────────────────────────

/** 리스크 집계 창 — "최근 30일" */
export const USER_RISK_WINDOW_DAYS = 30;

/**
 * 목록에 올릴 임계치 — **하나라도** 넘으면 유의 유저다.
 * 사고·결제 거절은 1건만 있어도 운영이 보고 싶어 하는 신호라 문턱을 1로 뒀고,
 * 지연 반납은 한 번쯤은 누구나 있어 2회부터 센다.
 */
export const USER_RISK_THRESHOLDS = {
  lateReturns: 2,
  incidents: 1,
  paymentFails: 1,
} as const;

export interface UserRiskCounts {
  lateReturnCount: number;
  incidentCount: number;
  paymentFailCount: number;
}

export const isUserAtRisk = (c: UserRiskCounts): boolean =>
  c.lateReturnCount >= USER_RISK_THRESHOLDS.lateReturns ||
  c.incidentCount >= USER_RISK_THRESHOLDS.incidents ||
  c.paymentFailCount >= USER_RISK_THRESHOLDS.paymentFails;

/**
 * 정렬용 점수. 사고가 가장 무겁고(3), 결제 거절과 지연 반납이 그다음(2·1)이다.
 * 순위를 만드는 값일 뿐 화면에는 배지(횟수)를 그대로 보여준다 — 점수는 사람이 못 읽는다.
 */
export const userRiskScore = (c: UserRiskCounts): number =>
  c.incidentCount * 3 + c.paymentFailCount * 2 + c.lateReturnCount;

// ─────────────────────────── 요청 DTO ───────────────────────────

/** `POST /ops/vehicles` — 차량 + 도입/보험 정보를 한 번에 등록한다 */
export const createOpsVehicleSchema = z
  .object({
    modelName: z.string().trim().min(1).max(50),
    plateNo: z.string().trim().min(1).max(20),
    fuel: z.enum(['EV', 'GASOLINE', 'HYBRID']),
    seats: z.number().int().min(2).max(12),
    zoneId: z.string().min(1),
    planId: z.string().min(1),
    imageUrl: z.string().url().optional(),
    /** 도입 정보 — 차량만 있고 원가가 없으면 회계 탭이 반쪽이 된다 */
    acquisitionType: z.enum(['PURCHASE', 'LEASE']),
    acquisitionCostKrw: z.number().int().positive().optional(),
    monthlyLeaseKrw: z.number().int().positive().optional(),
    acquiredAt: z.string().datetime({ offset: true }).optional(),
    insurerName: z.string().trim().min(1).max(50),
    insurancePremiumKrw: z.number().int().positive(),
    insuranceExpiresAt: z.string().datetime({ offset: true }),
  })
  .refine((v) => (v.acquisitionType === 'PURCHASE' ? v.acquisitionCostKrw != null : true), {
    message: '구매 차량은 취득가를 입력해 주세요',
    path: ['acquisitionCostKrw'],
  })
  .refine((v) => (v.acquisitionType === 'LEASE' ? v.monthlyLeaseKrw != null : true), {
    message: '리스 차량은 월 리스료를 입력해 주세요',
    path: ['monthlyLeaseKrw'],
  });
export type CreateOpsVehicleDto = z.infer<typeof createOpsVehicleSchema>;

/** `PATCH /ops/zones/:id/contract` — 계약이 없던 존이면 새로 만든다(upsert) */
export const updateZoneContractSchema = z
  .object({
    isPaid: z.boolean(),
    partnerName: z.string().trim().max(50).nullish(),
    monthlyFeeKrw: z.number().int().min(0),
    contractStart: z.string().datetime({ offset: true }).nullish(),
    contractEnd: z.string().datetime({ offset: true }).nullish(),
  })
  .refine((v) => (v.isPaid ? v.monthlyFeeKrw > 0 : v.monthlyFeeKrw === 0), {
    message: '유료 계약은 월 비용이 0보다 커야 하고, 무료 존은 0이어야 합니다',
    path: ['monthlyFeeKrw'],
  })
  .refine(
    (v) => !v.contractStart || !v.contractEnd || new Date(v.contractStart) < new Date(v.contractEnd),
    { message: '계약 종료일은 시작일 이후여야 합니다', path: ['contractEnd'] },
  );
export type UpdateZoneContractDto = z.infer<typeof updateZoneContractSchema>;

/** `POST /ops/inquiries/:id/answer` */
export const answerInquirySchema = z.object({
  answer: z.string().trim().min(5, '답변을 5자 이상 적어 주세요').max(2000),
});
export type AnswerInquiryDto = z.infer<typeof answerInquirySchema>;

/** `POST /ops/fleet/:id/notes` — 정비 메모 (M3-4 상세 패널 입력) */
export const createMaintenanceNoteSchema = z.object({
  body: z.string().trim().min(2, '메모를 2자 이상 적어 주세요').max(500),
});
export type CreateMaintenanceNoteDto = z.infer<typeof createMaintenanceNoteSchema>;

/** `GET /ops/fleet?state&zoneId` */
export const opsFleetQuerySchema = z.object({
  state: opsVehicleStateFilter(),
  zoneId: z.string().optional(),
});
export type OpsFleetQueryDto = z.infer<typeof opsFleetQuerySchema>;

/** `GET /ops/inquiries?status` */
export const opsInquiryQuerySchema = z.object({
  status: z.enum(['OPEN', 'ANSWERED']).optional(),
});
export type OpsInquiryQueryDto = z.infer<typeof opsInquiryQuerySchema>;

/** `GET /ops/accounting/summary?days` — 매출 집계 창 (비용은 월 고정비라 창과 무관) */
export const opsAccountingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
export type OpsAccountingQueryDto = z.infer<typeof opsAccountingQuerySchema>;

/** 상태 필터는 4종 중 하나 — zod enum을 두 번 적지 않으려고 함수로 뺀다 */
function opsVehicleStateFilter() {
  return z.enum(['IDLE', 'IN_USE', 'IN_TRANSIT', 'MAINTENANCE']).optional();
}
