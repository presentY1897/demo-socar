'use client';

import dayjs from 'dayjs';
import { useState } from 'react';
import useSWR from 'swr';
import type { CompleteHandlerTaskDto, HandlerQueueRes, HandlerTaskRes } from '@socar/shared';
import { HandlerTaskCard } from '@/components/HandlerTaskCard';
import { HandlerTaskDetail } from '@/components/HandlerTaskDetail';
import { api, swrFetcher } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { useSession } from '@/lib/session';

type Tab = 'queue' | 'history';

/**
 * 핸들러(운송기사) 작업 화면 — 배달앱 기사 앱의 문법.
 *
 * 현장에서 한 손으로 쓰는 화면이라 목록은 카드 한 장에 "무슨 일 / 어디서 어디로 / 언제까지"만
 * 담고, 지금 눌러야 할 버튼은 상세에 하나만 크게 둔다(수락 → 이동 시작 → 완료).
 * 상태가 바뀌면 큐를 다시 받아 카드가 알아서 자리를 옮긴다 — 완료한 작업은 이력 탭으로 간다.
 */
export default function HandlerPage() {
  const { user, ready } = useSession();
  const isHandler = user?.role === 'HANDLER';
  const { data, mutate } = useSWR<HandlerQueueRes>(isHandler ? '/handler/tasks' : null, swrFetcher);

  const [tab, setTab] = useState<Tab>('queue');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  if (ready && !user) {
    return <Notice>로그인 후 이용할 수 있어요</Notice>;
  }
  if (ready && !isHandler) {
    return <Notice>핸들러(운송기사) 계정만 볼 수 있는 화면이에요</Notice>;
  }

  const all = data ? [...data.today, ...data.upcoming, ...data.open, ...data.done] : [];
  // 목록이 갱신되면 열려 있는 상세도 새 상태를 그린다 (id로 다시 찾는다)
  const openTask = all.find((t) => t.id === openTaskId) ?? null;

  const act = async (id: string, path: string, body?: unknown) => {
    await api(`/handler/tasks/${id}/${path}`, { method: 'POST', body });
    await mutate();
  };

  async function accept(task: HandlerTaskRes) {
    setAcceptingId(task.id);
    try {
      await act(task.id, 'accept');
    } finally {
      setAcceptingId(null);
    }
  }

  const doneToday = data?.done.filter((t) => dayjs(t.completedAt).isSame(dayjs(), 'day')) ?? [];
  const doneEarlier = data?.done.filter((t) => !dayjs(t.completedAt).isSame(dayjs(), 'day')) ?? [];
  const todayCount = (data?.today.length ?? 0) + (data?.open.length ?? 0);

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">내 작업</h1>
        <span className="text-xs text-gray-400">{user?.name}님</span>
      </div>

      <div className="mt-3 flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
        <TabButton active={tab === 'queue'} onClick={() => setTab('queue')}>
          진행 중 {todayCount > 0 && <Badge>{todayCount}</Badge>}
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          완료 이력
        </TabButton>
      </div>

      {!data && <p className="py-16 text-center text-sm text-gray-400">작업을 불러오는 중...</p>}

      {data && tab === 'queue' && (
        <div className="mt-4 space-y-5">
          <Section title="오늘 할 일" count={data.today.length} empty="오늘 배정된 작업이 없어요">
            {data.today.map((t) => (
              <HandlerTaskCard key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </Section>

          {data.upcoming.length > 0 && (
            <Section title="예정" count={data.upcoming.length}>
              {data.upcoming.map((t) => (
                <HandlerTaskCard key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} withDate />
              ))}
            </Section>
          )}

          <Section
            title="수락 가능한 작업"
            count={data.open.length}
            empty="지금은 비어 있어요. 새 작업이 생기면 여기에 뜹니다"
          >
            {data.open.map((t) => (
              <HandlerTaskCard
                key={t.id}
                task={t}
                onOpen={() => setOpenTaskId(t.id)}
                withDate
                quickAction={{
                  label: '수락',
                  onClick: () => void accept(t),
                  busy: acceptingId === t.id,
                }}
              />
            ))}
          </Section>
        </div>
      )}

      {data && tab === 'history' && (
        <div className="mt-4 space-y-5">
          <Section title="오늘 완료" count={doneToday.length} empty="아직 오늘 완료한 작업이 없어요">
            {doneToday.map((t) => (
              <HistoryRow key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </Section>
          <Section title="이번 주" count={doneEarlier.length} empty="이번 주 다른 완료 기록이 없어요">
            {doneEarlier.map((t) => (
              <HistoryRow key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} withDate />
            ))}
          </Section>
        </div>
      )}

      {openTask && (
        <HandlerTaskDetail
          task={openTask}
          onClose={() => setOpenTaskId(null)}
          onAccept={() => act(openTask.id, 'accept')}
          onStart={() => act(openTask.id, 'start')}
          onComplete={async (dto: CompleteHandlerTaskDto) => {
            await act(openTask.id, 'complete', dto);
            setOpenTaskId(null); // 끝난 작업의 상세를 계속 열어 둘 이유가 없다
            setTab('history');
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500">
        {title} <span className="text-gray-300">{count}</span>
      </h2>
      <div className="mt-2 space-y-2">
        {count === 0 && empty ? (
          <p className="rounded-xl bg-white p-4 text-center text-xs text-gray-400">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function HistoryRow({
  task,
  onOpen,
  withDate = false,
}: {
  task: HandlerTaskRes;
  onOpen: () => void;
  withDate?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl bg-white p-3 text-left shadow-sm"
    >
      <p className="text-sm font-medium">
        {task.from.label} <span className="text-gray-400">→</span> {task.to.label}
      </p>
      <p className="mt-0.5 text-xs text-gray-400">
        {task.completedAt &&
          (withDate ? dayjs(task.completedAt).format('M월 D일 (ddd) HH:mm') : fmtTime(task.completedAt))}
        {' 완료'}
        {task.completionNote && ` · ${task.completionNote}`}
      </p>
    </button>
  );
}

const Notice = ({ children }: { children: React.ReactNode }) => (
  <p className="py-16 text-center text-sm text-gray-400">{children}</p>
);

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-1 rounded-full bg-sky-500 px-1.5 text-[11px] font-bold text-white">
    {children}
  </span>
);

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md py-1.5 font-medium ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
      }`}
    >
      {children}
    </button>
  );
}
