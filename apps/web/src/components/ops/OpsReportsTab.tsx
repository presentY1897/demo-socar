'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  REPORT_GROUP_BY_LABEL,
  REPORT_METRIC_META,
  REPORT_RANGE_PRESETS,
  reportGroupBysFor,
  reportMetricSchema,
  type ReportGroupBy,
  type ReportMetric,
  type ReportOptionsRes,
  type ReportResponseRes,
} from '@socar/shared';
import { ChartCanvas } from '@/components/charts/ChartCanvas';
import { swrFetcher } from '@/lib/api';
import { dayTickLabel, formatChartValue } from '@/lib/chart-config';
import { todayKst } from '@/lib/format';
import {
  applyRangePreset,
  chartKindFor,
  matchesPreset,
  readReportFilters,
  reportQueryString,
  withAllowedGroupBy,
  type ReportFilters,
} from '@/lib/ops-reports';
import { Empty, FormField, Panel, StatCard, inputClass } from './primitives';

/**
 * ⑦ 리포트 — 필터를 만지면 차트와 표가 같이 갱신되는 화면 (M4-3, 피드백 #6).
 *
 * 회계 탭 하위가 아니라 별도 탭으로 뒀다. 회계는 "이번 달 손익이 얼마인가"라는 정해진 질문에
 * 답하는 화면이고, 리포트는 질문 자체를 운영자가 조립하는 도구다 — 기간 버튼 하나도 뜻이
 * 달라서(회계의 days는 매출 집계 창, 리포트의 기간은 지표 전체의 축) 한 화면에 두면 섞인다.
 *
 * 필터 상태는 URL 쿼리에 그대로 적는다. 리포트는 "이거 봐 봐"라고 링크로 건네는 물건이라
 * 화면 상태로만 들고 있으면 같은 리포트를 두 번 만들 수 없다. 상태 ↔ 쿼리 변환 규칙은
 * 순수 함수(lib/ops-reports.ts)에 있고 Export(M4-4)가 같은 규칙으로 다운로드 URL을 만든다.
 */
export function OpsReportsTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayKst();

  // URL은 시작 상태이자 공유 수단이다 — 이후 조작은 상태를 바꾸고 URL에 되쓴다
  const [filters, setFilters] = useState<ReportFilters>(() =>
    readReportFilters(searchParams, today),
  );

  const query = reportQueryString(filters);
  const { data, isLoading } = useSWR<ReportResponseRes>(`/ops/reports?${query}`, swrFetcher);
  const { data: options } = useSWR<ReportOptionsRes>('/ops/reports/options', swrFetcher);

  const meta = REPORT_METRIC_META[filters.metric];

  const update = (next: ReportFilters) => {
    const applied = withAllowedGroupBy(next);
    setFilters(applied);
    // 탭까지 함께 적어야 링크를 열었을 때 리포트 탭에서 시작한다
    router.replace(`/dashboard?tab=reports&${reportQueryString(applied)}`, { scroll: false });
  };

  const rows = data?.rows ?? [];
  const labels = rows.map((r) => dayTickLabel(r.label));

  return (
    <div className="space-y-4">
      <Panel title="리포트 조건">
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <FormField label="지표">
            <select
              className={inputClass}
              value={filters.metric}
              onChange={(e) =>
                update({ ...filters, metric: e.target.value as ReportMetric })
              }
            >
              {reportMetricSchema.options.map((m) => (
                <option key={m} value={m}>
                  {REPORT_METRIC_META[m].label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="가르는 기준">
            {/* 선택지는 지표가 정한다 — 화면이 다시 판단하면 API가 400을 내는 조합이 뜬다 */}
            <select
              className={inputClass}
              value={filters.groupBy}
              onChange={(e) =>
                update({ ...filters, groupBy: e.target.value as ReportGroupBy })
              }
            >
              {reportGroupBysFor(filters.metric).map((g) => (
                <option key={g} value={g}>
                  {REPORT_GROUP_BY_LABEL[g]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="시작일">
            <input
              type="date"
              className={inputClass}
              value={filters.from}
              onChange={(e) => update({ ...filters, from: e.target.value })}
            />
          </FormField>

          <FormField label="종료일">
            <input
              type="date"
              className={inputClass}
              value={filters.to}
              onChange={(e) => update({ ...filters, to: e.target.value })}
            />
          </FormField>

          <FormField label="존">
            <select
              className={inputClass}
              value={filters.zoneId}
              onChange={(e) => update({ ...filters, zoneId: e.target.value })}
            >
              <option value="">전체 존</option>
              {(options?.zones ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="차종">
            <select
              className={inputClass}
              value={filters.model}
              onChange={(e) => update({ ...filters, model: e.target.value })}
            >
              <option value="">전체 차종</option>
              {(options?.models ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1" role="group" aria-label="기간 프리셋">
          {REPORT_RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => update(applyRangePreset(filters, preset, today))}
              aria-pressed={matchesPreset(filters, preset, today)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                matchesPreset(filters, preset, today)
                  ? 'bg-sky-500 font-semibold text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 내보내기(CSV/JSON) 버튼이 붙는 자리 — 동작은 M4-4 */}

        <p className="mt-2 text-[11px] text-gray-400">
          {meta.hint}
          {/* 기간을 바꿔도 안 움직이는 지표는 그 사실을 적는다 (회계의 월 고정비와 같은 비대칭) */}
          {!meta.periodSensitive && (
            <span className="ml-1 font-semibold text-amber-600">· 기간과 무관한 현재 값이에요</span>
          )}
        </p>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={`${meta.label} 전체`}
          value={data ? formatChartValue(data.meta.total, data.meta.unit) : '—'}
          sub={meta.unit === 'pct' ? '행 평균이 아닌 가중 평균' : undefined}
        />
        <StatCard label="가르는 기준" value={REPORT_GROUP_BY_LABEL[filters.groupBy]} />
        <StatCard
          label="기간"
          value={meta.periodSensitive ? `${filters.from} ~ ${filters.to}` : '현재 시점'}
        />
        <StatCard label="행 수" value={data ? `${rows.length}개` : '—'} />
      </div>

      <Panel title={`${meta.label} · ${REPORT_GROUP_BY_LABEL[filters.groupBy]}`}>
        <div className="mt-2">
          <ChartCanvas
            kind={chartKindFor(filters.groupBy)}
            // 존·차종 이름은 길어서 눕혀야 읽힌다
            horizontal={filters.groupBy !== 'day'}
            labels={labels}
            unit={data?.meta.unit ?? meta.unit}
            series={[{ label: meta.label, data: rows.map((r) => r.value) }]}
            loading={isLoading}
            height={filters.groupBy === 'day' ? 220 : Math.max(160, rows.length * 28 + 60)}
            ariaLabel={`${meta.label} ${REPORT_GROUP_BY_LABEL[filters.groupBy]} 차트`}
            emptyText="이 조건에 해당하는 데이터가 없어요"
          />
        </div>
      </Panel>

      <Panel
        title="표"
        action={<span className="text-[11px] text-gray-400">차트와 같은 데이터</span>}
      >
        {rows.length === 0 ? (
          <Empty>{isLoading ? '리포트를 불러오는 중...' : '이 조건에 해당하는 데이터가 없어요'}</Empty>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="py-1.5 font-medium">{REPORT_GROUP_BY_LABEL[filters.groupBy]}</th>
                  <th className="py-1.5 text-right font-medium">{meta.label}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-gray-50">
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatChartValue(r.value, data?.meta.unit ?? meta.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-1.5">전체</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {data ? formatChartValue(data.meta.total, data.meta.unit) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
