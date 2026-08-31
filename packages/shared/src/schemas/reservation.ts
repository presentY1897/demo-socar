import { z } from 'zod';

/** 예약은 최소 30분부터 10분 단위 슬롯으로 생성/변경한다 */
export const SLOT_MINUTES = 10;

export const insuranceTierSchema = z.enum(['LIGHT', 'STANDARD', 'FULL']);

/** 차량손해면책 상품 — 자기부담금 한도 기준 3종 (표시용 메타) */
export const INSURANCE_META = {
  LIGHT: {
    label: '실속보장',
    deductibleKrw: 700000,
    description: '자기부담금 최대 70만원',
  },
  STANDARD: {
    label: '표준보장',
    deductibleKrw: 300000,
    description: '자기부담금 최대 30만원',
  },
  FULL: {
    label: '완전보장',
    deductibleKrw: 0,
    description: '자기부담금 0원',
  },
} as const;

export const createReservationSchema = z
  .object({
    vehicleId: z.string().min(1),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    insurance: insuranceTierSchema,
    /** 편도 예약: 다른 존에 반납 (미지정 = 왕복) */
    returnZoneId: z.string().optional(),
    couponId: z.string().optional(),
    useCredit: z.boolean().default(false),
    /** 모의 PG: '0000'으로 끝나는 카드는 승인 거절 */
    cardLast4: z
      .string()
      .regex(/^\d{4}$/, '카드 뒤 4자리를 입력해 주세요')
      .default('4242'),
    /** 결제 멱등성 키 — 같은 키의 재시도는 중복 결제되지 않는다 */
    idempotencyKey: z.string().min(8).max(128),
  })
  .refine((v) => new Date(v.startAt) < new Date(v.endAt), {
    message: '반납 시각은 시작 시각 이후여야 합니다',
  });
export type CreateReservationDto = z.infer<typeof createReservationSchema>;

export const quoteRequestSchema = z.object({
  vehicleId: z.string().min(1),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  insurance: insuranceTierSchema,
  returnZoneId: z.string().optional(),
  couponId: z.string().optional(),
  useCredit: z.boolean().default(false),
});
export type QuoteRequestDto = z.infer<typeof quoteRequestSchema>;

/** 이용 전 예약 시간 변경 */
export const modifyReservationSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().min(8).max(128),
  })
  .refine((v) => new Date(v.startAt) < new Date(v.endAt), {
    message: '반납 시각은 시작 시각 이후여야 합니다',
  });
export type ModifyReservationDto = z.infer<typeof modifyReservationSchema>;

/** 이용 중 반납 시각 연장 */
export const extendRentalSchema = z.object({
  endAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128),
});
export type ExtendRentalDto = z.infer<typeof extendRentalSchema>;
