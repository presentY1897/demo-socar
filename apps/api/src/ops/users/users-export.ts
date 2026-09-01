import type { OpsUserRiskRes } from '@socar/shared';
import type { ExportSpec } from '../../common/export/export';

/**
 * 유의 유저 CSV의 열 (M4-4).
 *
 * 화면은 점수를 감추고 배지(횟수)만 보여주지만 파일에는 점수도 싣는다 — 화면에서 점수를
 * 감춘 이유는 "사람이 못 읽는 값"이라서지 숨겨야 할 값이라서가 아니고, 파일은 정렬 근거를
 * 재현할 수 있어야 한다.
 */
export const USERS_RISK_EXPORT: ExportSpec<OpsUserRiskRes> = {
  name: '유의유저',
  asciiName: 'at-risk-users',
  columns: [
    { header: '이름', value: (u) => u.name },
    { header: '이메일', value: (u) => u.email },
    { header: '지연 반납(회)', value: (u) => u.lateReturnCount },
    { header: '사고 접수(회)', value: (u) => u.incidentCount },
    { header: '결제 거절(회)', value: (u) => u.paymentFailCount },
    { header: '위험 점수', value: (u) => u.riskScore },
    { header: '마지막 지연 반납', value: (u) => u.lastLateAt },
  ],
};
