import { Prisma } from '@prisma/client';
import {
  isHandlerTaskOverdue,
  type HandlerTaskRes,
  type StoredPhotoRes,
  type TaskPlaceRes,
} from '@socar/shared';

/**
 * 작업 → API 응답 변환. 핸들러 큐(M2-3)와 운영 목록(M2-4)이 같은 형태를 내려주도록
 * 한 곳에 둔다 — 화면이 두 벌의 응답 모양을 알아야 할 이유가 없다.
 */

/** 응답을 만들려면 항상 함께 읽어야 하는 관계 */
export const HANDLER_TASK_INCLUDE = {
  vehicle: { select: { id: true, modelName: true, plateNo: true, fuel: true } },
  fromZone: true,
  toZone: true,
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.HandlerTaskInclude;

export type HandlerTaskRow = Prisma.HandlerTaskGetPayload<{
  include: typeof HANDLER_TASK_INCLUDE;
}>;

/**
 * 출발 지점 — 좌표 스냅샷이 있으면 그게 실제 픽업 지점이다(부름 회수의 수령지).
 * 없으면 존에서 출발한다.
 */
export function fromPlace(task: HandlerTaskRow): TaskPlaceRes {
  if (task.fromLat !== null && task.fromLng !== null) {
    return {
      zoneId: null,
      label: task.fromLabel ?? '수령지',
      lat: task.fromLat,
      lng: task.fromLng,
    };
  }
  return {
    zoneId: task.fromZone.id,
    label: task.fromZone.name,
    lat: task.fromZone.lat,
    lng: task.fromZone.lng,
  };
}

/** 도착 지점 — 존(회수·재배치) 또는 좌표(부름 배달의 수령지) */
export function toPlace(task: HandlerTaskRow): TaskPlaceRes {
  if (task.toZone) {
    return {
      zoneId: task.toZone.id,
      label: task.toZone.name,
      lat: task.toZone.lat,
      lng: task.toZone.lng,
    };
  }
  return {
    zoneId: null,
    label: task.toLabel ?? '수령지',
    lat: task.toLat ?? task.fromZone.lat,
    lng: task.toLng ?? task.fromZone.lng,
  };
}

/** 이동 시간 추정에 쓸 도로망 그래프 키 — 출발 존의 지역을 따른다 */
export const taskRegion = (task: HandlerTaskRow): string => task.fromZone.region;

export interface TaskResOptions {
  /** 출발 → 도착 예상 이동 시간(A*). 완료 이력에는 싣지 않는다 */
  travel?: { seconds: number; meters: number } | null;
  photos?: StoredPhotoRes[];
  now?: Date;
}

export function toHandlerTaskRes(task: HandlerTaskRow, opts: TaskResOptions = {}): HandlerTaskRes {
  const now = opts.now ?? new Date();
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    reservationId: task.reservationId,
    vehicle: task.vehicle,
    from: fromPlace(task),
    to: toPlace(task),
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    dueAt: task.dueAt.toISOString(),
    // 지연 판정은 shared 한 곳에서만 — 목록의 경고 배지(M2-5)와 같은 기준이다
    overdue: isHandlerTaskOverdue(task, now),
    etaMinutes: opts.travel ? Math.max(1, Math.round(opts.travel.seconds / 60)) : null,
    distanceMeters: opts.travel ? opts.travel.meters : null,
    assignedAt: task.assignedAt?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    canceledAt: task.canceledAt?.toISOString() ?? null,
    cancelReason: task.cancelReason,
    completionNote: task.completionNote,
    createdAt: task.createdAt.toISOString(),
    ...(opts.photos ? { photos: opts.photos } : {}),
  };
}
