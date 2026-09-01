import { z } from 'zod';

/**
 * 문의 접수.
 *
 * 카테고리는 DB enum(M1-1 마이그레이션)을 그대로 따른다 — 작업 문서 초안의
 * VEHICLE/USAGE/ETC 3종보다 세분화된 5종이라, 백오피스 문의함(M3-5)에서 담당 배분이 쉽다.
 */

export const inquiryCategorySchema = z.enum([
  'VEHICLE',
  'RESERVATION',
  'RETURN',
  'ACCIDENT',
  'ETC',
]);
export type InquiryCategoryValue = z.infer<typeof inquiryCategorySchema>;

export const inquiryStatusSchema = z.enum(['OPEN', 'ANSWERED']);
export type InquiryStatusValue = z.infer<typeof inquiryStatusSchema>;

export const INQUIRY_CATEGORY_LABEL: Record<InquiryCategoryValue, string> = {
  VEHICLE: '차량 상태·장비',
  RESERVATION: '예약·결제',
  RETURN: '반납·정산',
  ACCIDENT: '사고·보험',
  ETC: '기타',
};

export const INQUIRY_STATUS_LABEL: Record<InquiryStatusValue, string> = {
  OPEN: '답변 대기',
  ANSWERED: '답변 완료',
};

export const createInquirySchema = z.object({
  category: inquiryCategorySchema,
  body: z
    .string()
    .trim()
    .min(5, '문의 내용을 5자 이상 적어 주세요')
    .max(2000, '문의 내용은 2000자까지 쓸 수 있어요'),
  /** 특정 차량/이용에 대한 문의면 연결한다 (백오피스가 맥락을 바로 본다) */
  vehicleId: z.string().optional(),
  rentalId: z.string().optional(),
});
export type CreateInquiryDto = z.infer<typeof createInquirySchema>;
