import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canTransitionHandlerTask,
  HANDLER_TASK_STATUS_META,
  type AssignHandlerTaskDto,
  type CreateRepositionTaskDto,
  type HandlerCandidateRes,
  type HandlerTaskRes,
  type OpsTaskQueryDto,
} from '@socar/shared';
import {
  fromPlace,
  HANDLER_TASK_INCLUDE,
  toHandlerTaskRes,
  toPlace,
  type HandlerTaskRow,
} from '../../handler/handler-task.mapper';
import { PrismaService } from '../../prisma/prisma.service';
import { rankHandlerCandidates, type HandlerCandidateInput } from './handler-recommend';

/** 운영 목록 상한 — 화면은 필터로 좁혀 본다 */
const LIST_LIMIT = 100;

/**
 * 운영자가 작업을 보고 배정하는 API (M2-4). 화면은 M3-6.
 *
 * 배정은 핸들러 수락(M2-3)과 같은 전이(`PENDING/ASSIGNED → ASSIGNED`)를 쓴다 —
 * 문은 둘이지만 규칙은 shared 한 벌이다. 이동을 시작한 작업은 재배정할 수 없다.
 */
@Injectable()
export class OpsTasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** 전체 작업 목록 (상태·타입·기한 날짜 필터) */
  async list(query: OpsTaskQueryDto): Promise<HandlerTaskRes[]> {
    const tasks = await this.prisma.handlerTask.findMany({
      where: {
        status: query.status,
        type: query.type,
        dueAt: query.date ? dayRange(query.date) : undefined,
      },
      orderBy: { dueAt: 'asc' },
      take: LIST_LIMIT,
      include: HANDLER_TASK_INCLUDE,
    });
    // 운영 목록은 경로가 아니라 배정 상태를 보는 화면이라 이동 시간을 계산하지 않는다
    return tasks.map((t) => toHandlerTaskRes(t));
  }

  /** 배정·재배정 — 이동 시작 전에만 담당자를 바꿀 수 있다 */
  async assign(id: string, dto: AssignHandlerTaskDto): Promise<HandlerTaskRes> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.handlerTask.findUnique({ where: { id }, include: HANDLER_TASK_INCLUDE });
      if (!task) throw new NotFoundException('작업을 찾을 수 없습니다');

      if (!canTransitionHandlerTask(task.status, 'ASSIGNED')) {
        throw new ConflictException(
          `${HANDLER_TASK_STATUS_META[task.status].label} 상태에서는 배정을 바꿀 수 없어요`,
        );
      }

      const handler = await tx.user.findUnique({ where: { id: dto.handlerId } });
      if (!handler || handler.role !== 'HANDLER') {
        throw new NotFoundException('핸들러를 찾을 수 없습니다');
      }

      const updated = await tx.handlerTask.update({
        where: { id },
        data: { status: 'ASSIGNED', assigneeId: handler.id, assignedAt: new Date() },
        include: HANDLER_TASK_INCLUDE,
      });
      return toHandlerTaskRes(updated);
    });
  }

  /**
   * 재배치 작업 수동 생성.
   * 출발은 차량이 실제로 서 있는 존이다 — 운영자가 다른 존을 지정하면 거절한다.
   */
  async createReposition(dto: CreateRepositionTaskDto): Promise<HandlerTaskRes> {
    const dueAt = new Date(dto.dueAt);
    if (dueAt.getTime() <= Date.now()) {
      throw new BadRequestException('기한은 현재 시각 이후여야 합니다');
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');
    if (dto.fromZoneId && dto.fromZoneId !== vehicle.zoneId) {
      throw new BadRequestException('차량이 그 존에 없습니다');
    }
    if (dto.toZoneId === vehicle.zoneId) {
      throw new BadRequestException('출발과 도착이 같은 존입니다');
    }
    const toZone = await this.prisma.zone.findUnique({ where: { id: dto.toZoneId } });
    if (!toZone) throw new NotFoundException('도착 존을 찾을 수 없습니다');

    const task = await this.prisma.handlerTask.create({
      data: {
        type: 'REPOSITION',
        vehicleId: vehicle.id,
        fromZoneId: vehicle.zoneId,
        toZoneId: toZone.id,
        dueAt,
      },
      include: HANDLER_TASK_INCLUDE,
    });
    return toHandlerTaskRes(task);
  }

  /**
   * 배정 후보 — 핸들러들을 "마지막 완료 지점 → 이 작업의 출발지" 거리순으로.
   * 정렬 규칙 자체는 순수 함수(handler-recommend.ts)에 있다.
   */
  async candidates(id: string): Promise<HandlerCandidateRes[]> {
    const task = await this.prisma.handlerTask.findUnique({
      where: { id },
      include: HANDLER_TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('작업을 찾을 수 없습니다');

    const handlers = await this.prisma.user.findMany({
      where: { role: 'HANDLER' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    if (handlers.length === 0) return [];

    const handlerIds = handlers.map((h) => h.id);
    const [active, lastDone] = await Promise.all([
      this.prisma.handlerTask.groupBy({
        by: ['assigneeId'],
        where: { assigneeId: { in: handlerIds }, status: { in: ['ASSIGNED', 'EN_ROUTE'] } },
        _count: { _all: true },
      }),
      Promise.all(
        handlerIds.map((assigneeId) =>
          this.prisma.handlerTask.findFirst({
            where: { assigneeId, status: 'DONE' },
            orderBy: { completedAt: 'desc' },
            include: HANDLER_TASK_INCLUDE,
          }),
        ),
      ),
    ]);
    const activeCount = new Map(active.map((a) => [a.assigneeId, a._count._all]));

    const inputs: HandlerCandidateInput[] = handlers.map((h, i) => {
      const done = lastDone[i];
      return {
        handlerId: h.id,
        name: h.name,
        // 마지막 작업을 끝낸 자리 = 그 작업의 도착지
        lastPlace: done ? placeOf(done) : null,
        lastCompletedAt: done?.completedAt ?? null,
        activeTaskCount: activeCount.get(h.id) ?? 0,
      };
    });

    return rankHandlerCandidates(inputs, fromPlace(task));
  }
}

const placeOf = (task: HandlerTaskRow) => {
  const place = toPlace(task);
  return { label: place.label, lat: place.lat, lng: place.lng };
};

/** 그 날짜(로컬) 안에 기한이 있는 작업 */
function dayRange(date: string): Prisma.DateTimeFilter {
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) throw new BadRequestException('날짜 형식이 올바르지 않습니다');
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
}
