import {
  HANDLER_TASK_STATUS_META,
  HANDLER_TASK_TYPE_META,
  type HandlerTaskRes,
} from '@socar/shared';
import type { ExportSpec } from '../../common/export/export';

/**
 * 작업 목록 CSV의 열 (M4-4).
 *
 * 화면(③ 작업/배차)은 한 목록을 미배정·진행 중·처리량 셋으로 **갈라서** 보여주지만 파일은
 * 가르지 않는다: 파일을 셋으로 쪼개면 합계가 어디에도 없고, 화면의 분류 기준(상태)은
 * 열로 실려 있어 받는 쪽에서 언제든 다시 가를 수 있다. 순서는 서버 기준(기한 오름차순)이고
 * 이는 화면이 각 덩어리 안에서 쓰는 순서와 같다.
 *
 * `from`/`to`는 존이거나 좌표라 라벨만 낸다 — 좌표를 CSV에 실으면 사람이 읽을 수 없다.
 */
export const TASKS_EXPORT: ExportSpec<HandlerTaskRes> = {
  name: '작업목록',
  columns: [
    { header: '작업 유형', value: (t) => HANDLER_TASK_TYPE_META[t.type].label },
    { header: '상태', value: (t) => HANDLER_TASK_STATUS_META[t.status].label },
    { header: '지연', value: (t) => (t.overdue ? 'Y' : '') },
    { header: '차종', value: (t) => t.vehicle.modelName },
    { header: '차량 번호', value: (t) => t.vehicle.plateNo },
    { header: '출발', value: (t) => t.from.label },
    { header: '도착', value: (t) => t.to.label },
    { header: '담당 핸들러', value: (t) => t.assigneeName },
    { header: '기한', value: (t) => t.dueAt },
    { header: '배정 시각', value: (t) => t.assignedAt },
    { header: '이동 시작', value: (t) => t.startedAt },
    { header: '완료 시각', value: (t) => t.completedAt },
    { header: '취소 사유', value: (t) => t.cancelReason },
    { header: '인계 메모', value: (t) => t.completionNote },
  ],
};
