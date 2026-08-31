import { z } from 'zod';

export const UserRole = {
  USER: 'USER',
  CORP_MEMBER: 'CORP_MEMBER',
  CORP_ADMIN: 'CORP_ADMIN',
  OPS_ADMIN: 'OPS_ADMIN',
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
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
