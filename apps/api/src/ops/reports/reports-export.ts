import {
  REPORT_GROUP_BY_LABEL,
  REPORT_METRIC_META,
  REPORT_UNIT_LABEL,
  type ReportResponseRes,
  type ReportRowRes,
} from '@socar/shared';
import type { ExportSpec } from '../../common/export/export';

/**
 * 리포트 CSV의 열 (M4-4) — 열 이름이 조회 조건에 따라 달라진다.
 *
 * 값은 **숫자 그대로** 낸다(`120000`, `38.4`). `120,000원`처럼 꾸며 내면 엑셀이 문자열로
 * 읽어 합계가 안 잡힌다 — 단위는 헤더에 적는다(`매출(원)`).
 */
export const reportExportSpec = (meta: ReportResponseRes['meta']): ExportSpec<ReportRowRes> => {
  const metric = REPORT_METRIC_META[meta.metric];
  return {
    name: `리포트_${metric.label}`,
    columns: [
      { header: REPORT_GROUP_BY_LABEL[meta.groupBy], value: (r) => r.label },
      { header: `${metric.label}(${REPORT_UNIT_LABEL[meta.unit]})`, value: (r) => r.value },
    ],
  };
};

/** 파일명 꼬리 — 무슨 조건으로 뽑았는지가 파일명에 남는다 */
export const reportFilenameParts = (meta: ReportResponseRes['meta']): string[] => {
  const parts = [REPORT_GROUP_BY_LABEL[meta.groupBy]];
  // 기간에 반응하지 않는 지표(존 점유율)에 기간을 적으면 그 기간의 값처럼 읽힌다
  if (REPORT_METRIC_META[meta.metric].periodSensitive) {
    parts.push(meta.range.from, meta.range.to);
  }
  return parts;
};
