import { z } from 'zod';
import { photosSchema } from './photo';
import { INSURANCE_META, insuranceTierSchema } from './reservation';

/**
 * 사고 접수(모의).
 *
 * 실제 보험사 청구 연동은 스코프 아웃(Q5). 접수를 남기고, 가입한 면책상품에서
 * 자기부담금이 얼마인지 그 자리에서 알려주는 데까지가 이 기능의 범위다.
 */

export const incidentStatusSchema = z.enum(['RECEIVED', 'PROCESSING', 'CLOSED']);
export type IncidentStatusValue = z.infer<typeof incidentStatusSchema>;

export const INCIDENT_STATUS_LABEL: Record<IncidentStatusValue, string> = {
  RECEIVED: '접수 완료',
  PROCESSING: '처리 중',
  CLOSED: '종결',
};

export const createIncidentSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, '사고 상황을 10자 이상 적어 주세요')
    .max(2000, '사고 설명은 2000자까지 쓸 수 있어요'),
  /** 사고 직후엔 사진을 못 찍는 상황도 있어 첨부는 선택이다 */
  photos: photosSchema.default([]),
});
export type CreateIncidentDto = z.infer<typeof createIncidentSchema>;

/** 모의 보험사 — 실제 청구 연동 없이 안내만 한다 */
export const MOCK_INSURER = {
  name: 'MOCAR 모빌리티보험 (모의)',
  phone: '1588-0000',
  steps: [
    '차를 안전한 곳으로 옮기고 비상등을 켜 주세요',
    '다친 사람이 있으면 119, 상대 차량이 있으면 112에 먼저 신고해 주세요',
    '접수 번호로 모의 보험사가 순차 연락드립니다 (데모라 실제 연락은 가지 않아요)',
    '수리비는 가입하신 면책상품의 자기부담금 한도 안에서 정산됩니다',
  ],
} as const;

/** 예약의 면책상품 스냅샷에서 파생한 보장 안내 */
export const insuranceCoverageSchema = z.object({
  tier: insuranceTierSchema,
  label: z.string(),
  deductibleKrw: z.number().int(),
  description: z.string(),
});
export type InsuranceCoverageRes = z.infer<typeof insuranceCoverageSchema>;

export function insuranceCoverage(
  tier: keyof typeof INSURANCE_META,
): InsuranceCoverageRes {
  const meta = INSURANCE_META[tier];
  return {
    tier,
    label: meta.label,
    deductibleKrw: meta.deductibleKrw,
    description: meta.description,
  };
}
