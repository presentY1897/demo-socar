import { describe, expect, it } from 'vitest';
import { CORP_GRADES, CORP_PERMISSIONS, type CorpGrade } from '@socar/shared';
import type { AuthUser } from '@socar/shared';
import BoardPage from '@/app/biz/board/page';
import BizDispatchPage from '@/app/biz/dispatch/page';
import BizMembersPage from '@/app/biz/members/page';
import { AppShell } from '@/components/AppShell';
import { corpMembers, dispatchBoard, dispatchRecommended } from '@/test/msw/fixtures';
import { MOCK_USERS, renderWithProviders, screen } from '@/test/utils';

/**
 * 등급 4종 × 화면 노출 전수 (M5-4).
 *
 * 아래 표가 "화면이 이렇게 갈린다"의 명세다. 표 자체가 shared `CORP_PERMISSIONS`와
 * 일치하는지도 함께 검증하므로, 등급표를 바꾸면 화면 기대치도 여기서 같이 터진다 —
 * 화면 분기와 API 가드가 서로 다른 답을 내는 상태로 통과할 수 없다.
 */
interface Exposure {
  /** 하단 탭 */
  배차탭: boolean;
  보드탭: boolean;
  멤버탭: boolean;
  /** 배차 화면 */
  요청폼: boolean;
  승인버튼: boolean;
  /** URL 직접 접근 */
  보드화면: boolean;
  멤버화면: boolean;
}

const MATRIX: Record<CorpGrade, Exposure> = {
  VIEWER: { 배차탭: true, 보드탭: false, 멤버탭: false, 요청폼: false, 승인버튼: false, 보드화면: false, 멤버화면: false },
  REQUESTER: { 배차탭: true, 보드탭: false, 멤버탭: false, 요청폼: true, 승인버튼: false, 보드화면: false, 멤버화면: false },
  APPROVER: { 배차탭: true, 보드탭: true, 멤버탭: false, 요청폼: true, 승인버튼: true, 보드화면: true, 멤버화면: false },
  MANAGER: { 배차탭: true, 보드탭: true, 멤버탭: true, 요청폼: true, 승인버튼: true, 보드화면: true, 멤버화면: true },
};

const USER_BY_GRADE: Record<CorpGrade, AuthUser> = {
  VIEWER: MOCK_USERS.corpViewer,
  REQUESTER: MOCK_USERS.corpMember,
  APPROVER: MOCK_USERS.corpApprover,
  MANAGER: MOCK_USERS.corpAdmin,
};

describe('등급별 화면 분기 매트릭스', () => {
  it('노출 표가 shared CORP_PERMISSIONS와 같은 답을 낸다', () => {
    for (const grade of CORP_GRADES) {
      const p = CORP_PERMISSIONS[grade];
      expect({ grade, ...MATRIX[grade] }).toEqual({
        grade,
        배차탭: p.viewDispatch,
        보드탭: p.viewBoard,
        멤버탭: p.manageMembers,
        요청폼: p.createRequest,
        승인버튼: p.approve,
        보드화면: p.viewBoard,
        멤버화면: p.manageMembers,
      });
    }
  });

  it.each(CORP_GRADES)('%s — 하단 탭이 등급대로 노출된다', (grade) => {
    renderWithProviders(<AppShell>본문</AppShell>, {
      user: USER_BY_GRADE[grade],
      pathname: '/biz/dispatch',
    });

    const tab = (name: RegExp) => screen.queryByRole('link', { name });
    expect(!!tab(/배차/)).toBe(MATRIX[grade].배차탭);
    expect(!!tab(/보드/)).toBe(MATRIX[grade].보드탭);
    expect(!!tab(/멤버/)).toBe(MATRIX[grade].멤버탭);
  });

  it.each(CORP_GRADES)('%s — 배차 화면의 요청 폼·승인 버튼이 등급대로 노출된다', async (grade) => {
    renderWithProviders(<BizDispatchPage />, {
      user: USER_BY_GRADE[grade],
      pathname: '/biz/dispatch',
    });

    // 조회 권한은 전 등급에 있으므로 목록은 항상 보인다
    expect(await screen.findByText(dispatchRecommended.purpose)).toBeInTheDocument();
    expect(!!screen.queryByPlaceholderText(/사용 목적/)).toBe(MATRIX[grade].요청폼);
    expect(!!screen.queryByRole('button', { name: '이 차량으로 승인' })).toBe(
      MATRIX[grade].승인버튼,
    );
    expect(!!screen.queryByRole('button', { name: '요청 반려' })).toBe(MATRIX[grade].승인버튼);
  });

  it.each(CORP_GRADES)('%s — /biz/board 직접 접근은 viewBoard 권한대로 갈린다', async (grade) => {
    renderWithProviders(<BoardPage />, {
      user: USER_BY_GRADE[grade],
      pathname: '/biz/board',
    });

    if (MATRIX[grade].보드화면) {
      expect(
        await screen.findByText(`${dispatchBoard.office.name} 인근 3km 차량`),
      ).toBeInTheDocument();
      expect(screen.queryByText('접근 권한이 없어요')).not.toBeInTheDocument();
    } else {
      // 권한이 없으면 보드 API를 부르지 않고 안내만 (미핸들 요청은 MSW가 실패시킨다)
      expect(screen.getByText('접근 권한이 없어요')).toBeInTheDocument();
      expect(screen.getByText(/필요 등급: 승인/)).toBeInTheDocument(); // 최저 등급 안내
    }
  });

  it.each(CORP_GRADES)('%s — /biz/members 직접 접근은 manageMembers 권한대로 갈린다', async (grade) => {
    renderWithProviders(<BizMembersPage />, {
      user: USER_BY_GRADE[grade],
      pathname: '/biz/members',
    });

    if (MATRIX[grade].멤버화면) {
      expect(await screen.findByText(corpMembers[0].email)).toBeInTheDocument();
    } else {
      expect(screen.getByText('접근 권한이 없어요')).toBeInTheDocument();
      expect(screen.queryByText(corpMembers[0].email)).not.toBeInTheDocument();
    }
  });
});
