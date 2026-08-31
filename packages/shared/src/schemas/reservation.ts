import { z } from 'zod';

/** 예약은 30분 단위 슬롯으로만 생성/변경한다 */
export const SLOT_MINUTES = 30;

export const insuranceTierSchema = z.enum(['LIGHT', 'STANDARD', 'FULL']);

export const createReservationSchema = z
  .object({
    vehicleId: z.string().min(1),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    insurance: insuranceTierSchema,
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
    message: '종료 시각은 시작 시각 이후여야 합니다',
  });
export type CreateReservationDto = z.infer<typeof createReservationSchema>;

export const quoteRequestSchema = z.object({
  vehicleId: z.string().min(1),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  insurance: insuranceTierSchema,
  couponId: z.string().optional(),
  useCredit: z.boolean().default(false),
});
export type QuoteRequestDto = z.infer<typeof quoteRequestSchema>;
