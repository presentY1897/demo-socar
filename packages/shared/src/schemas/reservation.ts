import { z } from 'zod';

/** 예약은 30분 단위 슬롯으로만 생성/변경한다 */
export const SLOT_MINUTES = 30;

export const createReservationSchema = z
  .object({
    vehicleId: z.string().min(1),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    insurance: z.enum(['LIGHT', 'STANDARD', 'FULL']),
    couponId: z.string().optional(),
    useCredit: z.boolean().default(false),
  })
  .refine((v) => new Date(v.startAt) < new Date(v.endAt), {
    message: '종료 시각은 시작 시각 이후여야 합니다',
  });
export type CreateReservationDto = z.infer<typeof createReservationSchema>;
