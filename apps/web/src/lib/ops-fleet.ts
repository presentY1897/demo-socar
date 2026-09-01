/**
 * Fleet 표 정렬 — 규칙 자체는 shared로 옮겼다 (M4-4).
 *
 * Export가 화면과 **같은 순서**로 나가야 하는데(표에서 본 순서와 내려받은 파일의 순서가
 * 갈리면 같은 데이터로 보이지 않는다) 규칙이 웹에만 있으면 서버가 그것을 흉내 내야 한다.
 * 화면 쪽 import 경로는 그대로 두려고 여기서 다시 내보낸다.
 */
export {
  FLEET_SORT_LABEL,
  fleetSortKeySchema,
  sortDirSchema,
  sortFleet,
  type FleetSortKey,
  type SortDir,
} from '@socar/shared';
