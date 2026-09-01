import { z } from 'zod';
import type { CorpGrade } from '../corp/grade';

export const UserRole = {
  USER: 'USER',
  CORP_MEMBER: 'CORP_MEMBER',
  CORP_ADMIN: 'CORP_ADMIN',
  OPS_ADMIN: 'OPS_ADMIN',
  HANDLER: 'HANDLER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});
export type LoginDto = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  corporationId: string | null;
  /** 법인 내 등급 — 법인 미소속(개인/운영)은 null. 권한 판정은 CORP_PERMISSIONS 단일 소스 */
  corpGrade: CorpGrade | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
