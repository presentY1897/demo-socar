import { z } from 'zod';
import { requiredPhotosSchema } from './photo';

/**
 * 차량 상태 보고(체크인/체크아웃) 요청 계약.
 *
 * 사진이 보고의 증빙 자체라 두 단계 모두 최소 1장을 강제한다 —
 * 메모만 남은 보고는 나중에 분쟁이 생겼을 때 아무것도 증명하지 못한다.
 */

export const conditionPhaseSchema = z.enum(['CHECK_IN', 'CHECK_OUT']);
export type ConditionPhaseValue = z.infer<typeof conditionPhaseSchema>;

/** 이용 시작 전 차량 상태 보고 — 제출해야 스마트키(M1-4)가 열린다 */
export const checkInSchema = z.object({
  notes: z.string().max(500, '메모는 500자까지 쓸 수 있어요').optional(),
  photos: requiredPhotosSchema,
});
export type CheckInDto = z.infer<typeof checkInSchema>;

/** 반납 주차 상태 보고 — 제출해야 반납이 열린다 */
export const checkOutSchema = z.object({
  notes: z.string().max(500, '메모는 500자까지 쓸 수 있어요').optional(),
  /** 다음 이용자가 차를 찾는 유일한 단서라 층/구역은 필수다 */
  parkingNote: z
    .string()
    .min(1, '주차 위치(층·구역)를 적어 주세요')
    .max(100, '주차 위치는 100자까지 쓸 수 있어요'),
  photos: requiredPhotosSchema,
});
export type CheckOutDto = z.infer<typeof checkOutSchema>;
