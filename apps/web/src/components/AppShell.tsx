'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { BizShell } from './BizShell';

const NAV = [
  { href: '/', label: '홈', icon: '🗺️', show: () => true },
  { href: '/reservations', label: '예약', icon: '🚗', show: (role?: string) => !!role },
  {
    href: '/biz',
    label: '비즈니스',
    icon: '🏢',
    show: (role?: string) => role === 'CORP_MEMBER' || role === 'CORP_ADMIN',
  },
  { href: '/inquiries', label: '문의', icon: '💬', show: (role?: string) => !!role },
  { href: '/dashboard', label: '지표', icon: '📊', show: (role?: string) => role === 'OPS_ADMIN' },
];

/**
 * 루트 셸. `/biz/*`는 분리된 B2B 서비스라 소비자 셸 대신 BizShell을 쓴다 —
 * 루트 레이아웃 하나로 두 서비스를 태우는 유일한 접점이고, 법인 서비스를
 * 별도 앱으로 떼면 이 분기가 없어진다.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/biz')) return <BizShell>{children}</BizShell>;
  return <ConsumerShell>{children}</ConsumerShell>;
}

function ConsumerShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV.filter((n) => n.show(user?.role));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[1100] flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-sky-500">
          MOCAR
        </Link>
        {user ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">{user.name}</span>
            <button
              className="rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-500"
              onClick={() => {
                logout();
                router.push('/');
              }}
            >
              로그아웃
            </button>
          </div>
        ) : (
          <Link href="/login" className="rounded-md bg-sky-500 px-3 py-1 text-sm font-medium text-white">
            로그인
          </Link>
        )}
      </header>

      <main className="flex-1 pb-16">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-lg">
          {items.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                  active ? 'font-semibold text-sky-500' : 'text-gray-400'
                }`}
              >
                <span className="text-base leading-none">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
