'use client';

import Link from 'next/link';
import {
  CORP_GRADE_DESCRIPTIONS,
  CORP_GRADE_LABELS,
  hasCorpPermission,
  minimumGradeFor,
  type CorpPermission,
} from '@socar/shared';
import { useSession } from '@/lib/session';

/**
 * 화면 단위 등급 게이트.
 *
 * 탭을 숨기는 것만으로는 URL 직접 접근을 막지 못한다 — 권한이 없으면 API가 403을 주므로
 * 화면은 빈 화면·에러 대신 "왜 못 보는지"를 알려준다. 판정은 화면과 API가 같은
 * shared `CORP_PERMISSIONS`(= `hasCorpPermission`)를 본다.
 */
export function BizPermissionGate({
  permission,
  children,
}: {
  permission: CorpPermission;
  children: React.ReactNode;
}) {
  const { user, ready } = useSession();

  // 세션 복원 전에는 판정하지 않는다 — 잠깐 "권한 없음"이 번쩍이는 걸 막는다
  if (!ready) return null;
  if (hasCorpPermission(user?.corpGrade, permission)) return <>{children}</>;
  return <BizForbidden permission={permission} />;
}

/** 권한 없음 안내 — 필요한 등급은 등급표에서 끌어온다 (문구를 손으로 적지 않는다) */
function BizForbidden({ permission }: { permission: CorpPermission }) {
  const { user } = useSession();
  const required = minimumGradeFor(permission);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-3xl">🔒</p>
      <h1 className="mt-3 text-lg font-bold text-slate-700">접근 권한이 없어요</h1>
      <p className="mt-2 text-sm text-slate-500">
        {user?.corpGrade
          ? `현재 등급은 ${CORP_GRADE_LABELS[user.corpGrade]}예요`
          : '법인 계정으로 로그인해 주세요'}
      </p>
      {required && (
        <p className="mt-1 text-xs text-slate-400">
          {`필요 등급: ${CORP_GRADE_LABELS[required]} — ${CORP_GRADE_DESCRIPTIONS[required]}`}
        </p>
      )}
      <p className="mt-4 text-xs text-slate-400">등급 변경은 법인 관리자에게 요청하세요</p>
      <Link
        href="/biz/dispatch"
        className="mt-5 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"
      >
        배차 화면으로
      </Link>
    </div>
  );
}
