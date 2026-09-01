import { describe, expect, it } from 'vitest';
import {
  CORP_GRADES,
  CORP_GRADE_LABELS,
  CORP_PERMISSIONS,
  CorpGrade,
  corpGradeFromRole,
  corpGradeRank,
  hasCorpPermission,
  minimumGradeFor,
  updateCorpGradeSchema,
  type CorpPermission,
} from './grade';
import { UserRole } from '../schemas/auth';

describe('CORP_PERMISSIONS — 등급별 권한 매핑', () => {
  it('VIEWER는 조회만 가능하다', () => {
    expect(CORP_PERMISSIONS.VIEWER.viewDispatch).toBe(true);
    expect(CORP_PERMISSIONS.VIEWER.createRequest).toBe(false);
    expect(CORP_PERMISSIONS.VIEWER.approve).toBe(false);
    expect(CORP_PERMISSIONS.VIEWER.manageMembers).toBe(false);
    expect(CORP_PERMISSIONS.VIEWER.manageFleet).toBe(false);
  });

  it('REQUESTER는 요청 생성까지, 승인은 불가', () => {
    expect(CORP_PERMISSIONS.REQUESTER.createRequest).toBe(true);
    expect(CORP_PERMISSIONS.REQUESTER.approve).toBe(false);
    expect(CORP_PERMISSIONS.REQUESTER.viewBoard).toBe(false);
  });

  it('APPROVER는 승인·보드까지, 멤버/플릿 관리는 불가', () => {
    expect(CORP_PERMISSIONS.APPROVER.approve).toBe(true);
    expect(CORP_PERMISSIONS.APPROVER.viewBoard).toBe(true);
    expect(CORP_PERMISSIONS.APPROVER.manageMembers).toBe(false);
    expect(CORP_PERMISSIONS.APPROVER.manageFleet).toBe(false);
  });

  it('MANAGER는 모든 권한을 갖는다', () => {
    expect(Object.values(CORP_PERMISSIONS.MANAGER).every(Boolean)).toBe(true);
  });

  it('등급이 높아질수록 권한은 줄어들지 않는다 (누적 구조)', () => {
    const keys = Object.keys(CORP_PERMISSIONS.MANAGER) as CorpPermission[];
    for (let i = 1; i < CORP_GRADES.length; i++) {
      const lower = CORP_PERMISSIONS[CORP_GRADES[i - 1]];
      const upper = CORP_PERMISSIONS[CORP_GRADES[i]];
      for (const key of keys) {
        if (lower[key]) expect(upper[key]).toBe(true);
      }
    }
  });

  it('등급 4종 모두 라벨과 권한 정의가 있다', () => {
    for (const grade of CORP_GRADES) {
      expect(CORP_GRADE_LABELS[grade]).toBeTruthy();
      expect(CORP_PERMISSIONS[grade]).toBeDefined();
    }
    expect(CORP_GRADES).toHaveLength(4);
  });
});

describe('hasCorpPermission', () => {
  it('등급별 판정이 매핑과 일치한다', () => {
    expect(hasCorpPermission(CorpGrade.VIEWER, 'createRequest')).toBe(false);
    expect(hasCorpPermission(CorpGrade.REQUESTER, 'createRequest')).toBe(true);
    expect(hasCorpPermission(CorpGrade.APPROVER, 'approve')).toBe(true);
    expect(hasCorpPermission(CorpGrade.MANAGER, 'manageFleet')).toBe(true);
  });

  it('등급 없음(법인 미소속)은 항상 false', () => {
    expect(hasCorpPermission(null, 'viewDispatch')).toBe(false);
    expect(hasCorpPermission(undefined, 'viewDispatch')).toBe(false);
  });
});

describe('corpGradeRank', () => {
  it('VIEWER < REQUESTER < APPROVER < MANAGER', () => {
    expect(corpGradeRank(CorpGrade.VIEWER)).toBeLessThan(corpGradeRank(CorpGrade.REQUESTER));
    expect(corpGradeRank(CorpGrade.REQUESTER)).toBeLessThan(corpGradeRank(CorpGrade.APPROVER));
    expect(corpGradeRank(CorpGrade.APPROVER)).toBeLessThan(corpGradeRank(CorpGrade.MANAGER));
  });
});

describe('corpGradeFromRole — 기존 계정 폴백 매핑', () => {
  it('CORP_MEMBER→REQUESTER, CORP_ADMIN→MANAGER', () => {
    expect(corpGradeFromRole(UserRole.CORP_MEMBER)).toBe(CorpGrade.REQUESTER);
    expect(corpGradeFromRole(UserRole.CORP_ADMIN)).toBe(CorpGrade.MANAGER);
  });

  it('법인 미소속 역할은 등급 없음', () => {
    expect(corpGradeFromRole(UserRole.USER)).toBeNull();
    expect(corpGradeFromRole(UserRole.OPS_ADMIN)).toBeNull();
  });
});

describe('updateCorpGradeSchema', () => {
  it('정의된 등급만 허용한다', () => {
    expect(updateCorpGradeSchema.parse({ grade: 'APPROVER' }).grade).toBe('APPROVER');
    expect(updateCorpGradeSchema.safeParse({ grade: 'OWNER' }).success).toBe(false);
  });
});

describe('minimumGradeFor — 권한을 갖는 최저 등급', () => {
  it('권한별 최저 등급을 등급표에서 끌어온다', () => {
    expect(minimumGradeFor('viewDispatch')).toBe(CorpGrade.VIEWER);
    expect(minimumGradeFor('createRequest')).toBe(CorpGrade.REQUESTER);
    expect(minimumGradeFor('approve')).toBe(CorpGrade.APPROVER);
    expect(minimumGradeFor('viewBoard')).toBe(CorpGrade.APPROVER);
    expect(minimumGradeFor('manageMembers')).toBe(CorpGrade.MANAGER);
    expect(minimumGradeFor('manageFleet')).toBe(CorpGrade.MANAGER);
  });

  it('최저 등급 이상은 모두 그 권한을 갖는다 (등급이 서열대로 누적된다)', () => {
    const permissions = Object.keys(CORP_PERMISSIONS.MANAGER) as CorpPermission[];
    for (const permission of permissions) {
      const min = minimumGradeFor(permission);
      expect(min).not.toBeNull();
      for (const grade of CORP_GRADES) {
        expect(hasCorpPermission(grade, permission)).toBe(
          corpGradeRank(grade) >= corpGradeRank(min!),
        );
      }
    }
  });
});
