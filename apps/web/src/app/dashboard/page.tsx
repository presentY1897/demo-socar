'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { OPS_TAB_LABEL, opsTabSchema, type OpsTab } from '@socar/shared';
import { OpsAccountingTab } from '@/components/ops/OpsAccountingTab';
import { OpsCustomersTab } from '@/components/ops/OpsCustomersTab';
import { OpsDispatchTab } from '@/components/ops/OpsDispatchTab';
import { OpsFleetTab } from '@/components/ops/OpsFleetTab';
import { OpsHomeTab } from '@/components/ops/OpsHomeTab';
import { OpsReportsTab } from '@/components/ops/OpsReportsTab';
import { OpsZonesTab } from '@/components/ops/OpsZonesTab';
import { useSession } from '@/lib/session';

/**
 * 운영 센터 — 매출 대시보드였던 `/dashboard`를 운영자가 쓰는 탭 도구로 바꾼 화면 (M3-4~6 · 리포트 탭 M4-3).
 *
 * 탭 목록·라벨은 shared(`opsTabSchema` · `OPS_TAB_LABEL`)가 단일 소스다. 경고 피드가
 * "이 항목은 어느 탭 소관"인지를 서버 응답(`alert.tab`)으로 실어 오기 때문에, 화면이 탭을
 * 따로 적으면 서버가 보내는 탭 키와 조용히 어긋난다.
 *
 * 탭 상태는 URL 쿼리(`?tab=fleet`)로 시작해 이후로는 화면 상태로 든다 — 딥링크는 열리되
 * 탭을 옮길 때마다 라우터를 돌려 화면 전체를 다시 마운트하지는 않는다.
 */
export default function DashboardPage() {
  // useSearchParams()는 정적 프리렌더에서 서스펜스 경계를 요구한다 (딥링크 `?tab=`을 읽는 대가)
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-gray-400">불러오는 중...</p>}>
      <OpsCenter />
    </Suspense>
  );
}

function OpsCenter() {
  const { user, ready } = useSession();
  const isOps = user?.role === 'OPS_ADMIN';

  const searchParams = useSearchParams();
  const fromUrl = opsTabSchema.safeParse(searchParams.get('tab'));
  const [tab, setTab] = useState<OpsTab>(fromUrl.success ? fromUrl.data : 'home');
  /** 경고에서 넘어왔을 때 그 탭이 열어야 할 행 (서버가 준 alert.targetId) */
  const [targetId, setTargetId] = useState<string | null>(null);

  if (ready && !isOps) {
    return (
      <p className="py-16 text-center text-sm text-gray-400">운영 어드민 계정으로 로그인하세요</p>
    );
  }

  const goto = (next: OpsTab, target?: string) => {
    setTab(next);
    setTargetId(target ?? null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <h1 className="text-xl font-bold">운영 센터</h1>
      <p className="text-sm text-gray-500">차량·작업·계약·고객을 한 화면에서 봅니다</p>

      <div role="tablist" aria-label="운영 센터 탭" className="mt-3 flex gap-1 overflow-x-auto pb-1">
        {opsTabSchema.options.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => goto(t)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              tab === t ? 'bg-sky-500 font-semibold text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {OPS_TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'home' && <OpsHomeTab onNavigate={goto} />}
        {tab === 'fleet' && <OpsFleetTab targetId={targetId} />}
        {tab === 'dispatch' && <OpsDispatchTab />}
        {tab === 'zones' && <OpsZonesTab targetId={targetId} />}
        {tab === 'customers' && <OpsCustomersTab targetId={targetId} />}
        {tab === 'accounting' && <OpsAccountingTab />}
        {tab === 'reports' && <OpsReportsTab />}
      </div>
    </div>
  );
}
