'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { hasCorpPermission, type AuthUser, type CorpPermission } from '@socar/shared';
import { useSession } from '@/lib/session';

/**
 * MOCAR 비즈니스 셸 — `/biz/*` 전용.
 *
 * 소비자 앱 셸(AppShell)과 내비·브랜딩을 공유하지 않는다. 법인 서비스를 별도 앱으로
 * 떼어낼 때 이 셸과 `/biz` 라우트 그룹이 그대로 새 앱의 루트가 되도록 분리해 둔 것이다.
 */

interface BizNavItem {
  href: string;
  label: string;
  icon: string;
  /** 이 탭을 보려면 필요한 법인 권한 — 판정은 shared CORP_PERMISSIONS 단일 소스 */
  permission: CorpPermission;
}

const BIZ_NAV: BizNavItem[] = [
  { href: '/biz/dispatch', label: '배차', icon: '🚘', permission: 'viewDispatch' },
  { href: '/biz/board', label: '보드', icon: '📋', permission: 'viewBoard' },
  { href: '/biz/fleet', label: '플릿', icon: '🚙', permission: 'manageFleet' },
  { href: '/biz/members', label: '멤버', icon: '👥', permission: 'manageMembers' },
];

/** 법인 서비스 이용 자격 = 등급 보유 여부 (역할이 아니다) */
const isBizUser = (user: AuthUser | null) => !!user?.corporationId && !!user.corpGrade;

export function BizShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const items = BIZ_NAV.filter((n) => hasCorpPermission(user?.corpGrade, n.permission));

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="sticky top-0 z-[1100] flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4">
        <Link href="/biz" className="flex items-baseline gap-1.5">
          <span className="text-lg font-extrabold tracking-tight text-indigo-600">MOCAR</span>
          <span className="text-sm font-semibold text-slate-500">비즈니스</span>
        </Link>
        {user ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">{user.name}</span>
            {/* 법인 계정은 개인 이용(소비자 앱)도 하므로 돌아갈 길을 남긴다 */}
            <Link href="/" className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-500">
              일반 서비스
            </Link>
            <button
              className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-500"
              onClick={() => {
                logout();
                router.push('/');
              }}
            >
              로그아웃
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white"
          >
            로그인
          </Link>
        )}
      </header>

      <main className="flex-1 pb-16">
        {isBizUser(user) ? (
          children
        ) : (
          <p className="py-16 text-center text-sm text-slate-400">
            법인 계정으로 로그인하면 MOCAR 비즈니스를 이용할 수 있어요
          </p>
        )}
      </main>

      {isBizUser(user) && (
        <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-lg">
            {items.map((n) => {
              const active = pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                    active ? 'font-semibold text-indigo-600' : 'text-slate-400'
                  }`}
                >
                  <span className="text-base leading-none">{n.icon}</span>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
