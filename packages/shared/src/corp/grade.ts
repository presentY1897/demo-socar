import { z } from 'zod';
import { UserRole } from '../schemas/auth';

/**
 * 법인 멤버 등급 (MOCAR 비즈니스) — 법인 소속 사용자에게만 부여된다.
 * Role(USER/CORP_MEMBER/CORP_ADMIN/OPS_ADMIN)은 서비스 전역 역할이고,
 * 등급은 그 안에서 "법인 내 권한"만 세분화한다.
 *   VIEWER    현황 조회만
 *   REQUESTER + 배차 요청 생성
 *   APPROVER  + 추천 검토·승인/반려 · 타임라인 보드
 *   MANAGER   + 멤버 등급 관리 · 플릿/리스 관리 · 법인 설정
 */
export const CorpGrade = {
  VIEWER: 'VIEWER',
  REQUESTER: 'REQUESTER',
  APPROVER: 'APPROVER',
  MANAGER: 'MANAGER',
} as const;
export type CorpGrade = (typeof CorpGrade)[keyof typeof CorpGrade];

/** 낮은 등급 → 높은 등급 순 (드롭다운·비교용) */
export const CORP_GRADES: readonly CorpGrade[] = [
  CorpGrade.VIEWER,
  CorpGrade.REQUESTER,
  CorpGrade.APPROVER,
  CorpGrade.MANAGER,
] as const;

/** 화면 표기용 라벨 */
export const CORP_GRADE_LABELS: Record<CorpGrade, string> = {
  VIEWER: '조회',
  REQUESTER: '요청',
  APPROVER: '승인',
  MANAGER: '관리자',
};

/** 등급별 한 줄 설명 (등급 변경 UI 안내) */
export const CORP_GRADE_DESCRIPTIONS: Record<CorpGrade, string> = {
  VIEWER: '배차 현황 조회만 가능',
  REQUESTER: '조회 + 배차 요청 생성',
  APPROVER: '요청 승인/반려 + 타임라인 보드',
  MANAGER: '멤버 등급 · 플릿/리스 · 법인 설정 관리',
};

/**
 * 법인 권한 항목. API 가드(@RequireCorpPermission)와 웹 화면 분기가 같은 키를 쓴다.
 */
export interface CorpPermissionSet {
  /** 배차 요청 목록·상세 등 법인 현황 조회 */
  viewDispatch: boolean;
  /** 배차 요청 생성 */
  createRequest: boolean;
  /** 추천 후보 승인/반려 */
  approve: boolean;
  /** 차량 × 시간 타임라인 보드 */
  viewBoard: boolean;
  /** 멤버 등급 부여/변경 */
  manageMembers: boolean;
  /** 플릿(리스 차량)·리스 계약 관리 — 연장/해지 요청 */
  manageFleet: boolean;
  /** 법인 설정 변경 */
  manageSettings: boolean;
}
export type CorpPermission = keyof CorpPermissionSet;

/**
 * 등급 → 권한 매핑 (단일 소스).
 * API 가드와 웹 분기가 이 상수만 보고 판정한다 — 어느 쪽에도 하드코딩 금지.
 */
export const CORP_PERMISSIONS: Record<CorpGrade, CorpPermissionSet> = {
  VIEWER: {
    viewDispatch: true,
    createRequest: false,
    approve: false,
    viewBoard: false,
    manageMembers: false,
    manageFleet: false,
    manageSettings: false,
  },
  REQUESTER: {
    viewDispatch: true,
    createRequest: true,
    approve: false,
    viewBoard: false,
    manageMembers: false,
    manageFleet: false,
    manageSettings: false,
  },
  APPROVER: {
    viewDispatch: true,
    createRequest: true,
    approve: true,
    viewBoard: true,
    manageMembers: false,
    manageFleet: false,
    manageSettings: false,
  },
  MANAGER: {
    viewDispatch: true,
    createRequest: true,
    approve: true,
    viewBoard: true,
    manageMembers: true,
    manageFleet: true,
    manageSettings: true,
  },
};

/** 등급이 해당 권한을 갖는지 — 등급 없음(법인 미소속)은 항상 false */
export function hasCorpPermission(
  grade: CorpGrade | null | undefined,
  permission: CorpPermission,
): boolean {
  if (!grade) return false;
  return CORP_PERMISSIONS[grade]?.[permission] ?? false;
}

/** 등급 서열 비교용 인덱스 (VIEWER=0 … MANAGER=3) */
export function corpGradeRank(grade: CorpGrade): number {
  return CORP_GRADES.indexOf(grade);
}

/**
 * 그 권한을 갖는 가장 낮은 등급 — 권한 없음 안내에서 "어느 등급부터 되는지"를 알려줄 때 쓴다.
 * 문구를 손으로 적지 않고 등급표에서 끌어오므로 안내와 실제 판정이 갈라지지 않는다.
 */
export function minimumGradeFor(permission: CorpPermission): CorpGrade | null {
  return CORP_GRADES.find((grade) => CORP_PERMISSIONS[grade][permission]) ?? null;
}

/**
 * 등급이 없는 기존 계정의 폴백 매핑 (마이그레이션 백필과 같은 규칙).
 * CORP_MEMBER→REQUESTER, CORP_ADMIN→MANAGER, 그 외 법인 미소속은 null.
 */
export function corpGradeFromRole(role: UserRole): CorpGrade | null {
  if (role === UserRole.CORP_MEMBER) return CorpGrade.REQUESTER;
  if (role === UserRole.CORP_ADMIN) return CorpGrade.MANAGER;
  return null;
}

export const corpGradeSchema = z.enum(['VIEWER', 'REQUESTER', 'APPROVER', 'MANAGER']);

export const updateCorpGradeSchema = z.object({ grade: corpGradeSchema });
export type UpdateCorpGradeDto = z.infer<typeof updateCorpGradeSchema>;
