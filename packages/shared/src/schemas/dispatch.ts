import { z } from 'zod';

export const createDispatchRequestSchema = z
  .object({
    purpose: z.string().min(1).max(100),
    desiredStartAt: z.string().datetime({ offset: true }),
    desiredEndAt: z.string().datetime({ offset: true }),
  })
  .refine((v) => new Date(v.desiredStartAt) < new Date(v.desiredEndAt), {
    message: '종료 시각은 시작 시각 이후여야 합니다',
  });
export type CreateDispatchRequestDto = z.infer<typeof createDispatchRequestSchema>;

export const approveDispatchSchema = z.object({
  candidateId: z.string().min(1),
});
export type ApproveDispatchDto = z.infer<typeof approveDispatchSchema>;

export const rejectDispatchSchema = z.object({
  reason: z.string().min(1).max(200),
});
export type RejectDispatchDto = z.infer<typeof rejectDispatchSchema>;
