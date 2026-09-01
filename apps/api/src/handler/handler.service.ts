import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canTransitionHandlerTask,
  HANDLER_TASK_STATUS_META,
  type CompleteHandlerTaskDto,
  type HandlerQueueRes,
  type HandlerTaskRes,
  type HandlerTaskStatusValue,
} from '@socar/shared';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { toPhotoRows, toStoredPhotos } from '../photos/photo-storage';
import { PrismaService } from '../prisma/prisma.service';
import { TRAVEL_ESTIMATOR, type TravelTimeEstimator } from '../common/travel/travel-time';
import { TelemetryService } from '../telemetry/telemetry.service';
import {
  fromPlace,
  HANDLER_TASK_INCLUDE,
  taskRegion,
  toHandlerTaskRes,
  toPlace,
  type HandlerTaskRow,
} from './handler-task.mapper';

/** 인계 상태 — 어느 작업이든 차는 잠긴 채 시동이 꺼져서 넘어간다. 다음 사람이 스마트키로 연다 */
const HANDOVER_STATE = { doorLocked: true, engineOn: false } as const;

/** 완료 이력 조회 범위 — 화면의 "오늘 / 이번 주" 탭이 쓰는 창 */
const HISTORY_DAYS = 7;
/** 공개 작업 목록 상한 — 현장 화면이라 스크롤이 길어지면 쓸모가 없다 */
const OPEN_TASK_LIMIT = 20;

/**
 * 핸들러가 자기 작업을 받아 처리하는 API (M2-3).
 *
 * 전이 규칙은 shared(handler-task.ts) 한 벌만 본다 — 화면의 버튼 활성 조건과
 * 서버의 거절 조건이 어긋나지 않게 하기 위해서다.
 *
 * 완료는 기록으로 끝나지 않고 실물에 반영된다:
 *   DELIVERY 완료   → 차는 수령지에 잠긴 채 인계 (소속 존은 그대로 — 제자리 회수가 남아 있다)
 *   RETRIEVE/REPOSITION 완료 → `vehicle.zoneId`를 도착 존으로 갱신
 */
@Injectable()
export class HandlerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRAVEL_ESTIMATOR) private readonly travel: TravelTimeEstimator,
    private readonly telemetry: TelemetryService,
  ) {}

  /**
   * 내 작업 + 수락 가능한 공개 작업 + 최근 완료 이력.
   *
   * 오늘/예정은 서버 로컬 자정을 경계로 나눈다 — 현장 화면의 "오늘 할 일"은
   * 기한이 오늘 안에 있는 작업이다.
   */
  async queue(user: JwtUser): Promise<HandlerQueueRes> {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const historyFrom = new Date(now.getTime() - HISTORY_DAYS * 24 * 3600 * 1000);

    const [mine, open, done] = await Promise.all([
      this.prisma.handlerTask.findMany({
        where: { assigneeId: user.id, status: { in: ['ASSIGNED', 'EN_ROUTE'] } },
        orderBy: { dueAt: 'asc' },
        include: HANDLER_TASK_INCLUDE,
      }),
      this.prisma.handlerTask.findMany({
        where: { status: 'PENDING', assigneeId: null },
        orderBy: { dueAt: 'asc' },
        take: OPEN_TASK_LIMIT,
        include: HANDLER_TASK_INCLUDE,
      }),
      this.prisma.handlerTask.findMany({
        where: { assigneeId: user.id, status: 'DONE', completedAt: { gte: historyFrom } },
        orderBy: { completedAt: 'desc' },
        include: HANDLER_TASK_INCLUDE,
      }),
    ]);

    const [todayRes, upcomingRes, openRes] = await Promise.all([
      this.withTravel(
        mine.filter((t) => t.dueAt < tomorrow),
        now,
      ),
      this.withTravel(
        mine.filter((t) => t.dueAt >= tomorrow),
        now,
      ),
      this.withTravel(open, now),
    ]);

    return {
      today: todayRes,
      upcoming: upcomingRes,
      open: openRes,
      // 끝난 작업에는 이동 시간을 계산하지 않는다 (A* 호출을 이력 길이만큼 늘릴 이유가 없다)
      done: done.map((t) => toHandlerTaskRes(t, { now })),
    };
  }

  /** 공개 작업 수락 — PENDING → ASSIGNED(본인) */
  async accept(user: JwtUser, id: string): Promise<HandlerTaskRes> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.taskOrThrow(tx, id);
      this.assertTransition(task.status, 'ASSIGNED');
      // 전이표는 운영자 재배정(ASSIGNED→ASSIGNED)도 허용하지만, 그건 핸들러가 쓰는 문이 아니다
      if (task.status !== 'PENDING' || task.assigneeId !== null) {
        throw new ConflictException('이미 다른 핸들러가 맡은 작업이에요');
      }

      const updated = await tx.handlerTask.update({
        where: { id },
        data: { status: 'ASSIGNED', assigneeId: user.id, assignedAt: new Date() },
        include: HANDLER_TASK_INCLUDE,
      });
      return this.one(updated);
    });
  }

  /** 이동 시작 — ASSIGNED → EN_ROUTE */
  async start(user: JwtUser, id: string): Promise<HandlerTaskRes> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.ownTask(tx, user, id);
      this.assertTransition(task.status, 'EN_ROUTE');

      const updated = await tx.handlerTask.update({
        where: { id },
        data: { status: 'EN_ROUTE', startedAt: new Date() },
        include: HANDLER_TASK_INCLUDE,
      });
      return this.one(updated);
    });
  }

  /**
   * 완료 — EN_ROUTE → DONE. 인계 사진 + 메모 필수(스키마에서 강제).
   *
   * 차량의 실제 위치·상태를 여기서 갱신한다. 작업이 끝났다는 기록만 남고 차는 그대로면
   * 다음 이용자가 없는 자리에서 차를 찾게 된다.
   */
  async complete(user: JwtUser, id: string, dto: CompleteHandlerTaskDto): Promise<HandlerTaskRes> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.ownTask(tx, user, id);
      this.assertTransition(task.status, 'DONE');

      const updated = await tx.handlerTask.update({
        where: { id },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          completionNote: dto.note,
          photos: { create: toPhotoRows(dto.photos) },
        },
        include: { ...HANDLER_TASK_INCLUDE, photos: { orderBy: { createdAt: 'asc' } } },
      });

      // 존은 차량이, 센서 상태는 텔레메트리가 갖는다 (M3-1에서 이관)
      const zoneMove = this.vehicleZoneAfter(task);
      if (zoneMove) {
        await tx.vehicle.update({ where: { id: task.vehicleId }, data: { zoneId: zoneMove } });
      }
      // 작업 완료 = 이동이 끝난 순간이라 그 시점 값으로 텔레메트리를 확정한다 (M3-2).
      // 차는 도착지에 잠긴 채 시동이 꺼진 상태로 선다.
      await this.telemetry.freeze(tx, task.vehicleId, {
        position: toPlace(task),
        state: HANDOVER_STATE,
        drivenSince: task.startedAt ?? task.assignedAt,
      });

      return this.one(updated, { photos: toStoredPhotos(updated.photos) });
    });
  }

  /**
   * 완료 시점의 차량 존 반영 — 옮기지 않는 작업이면 null.
   *
   * 존은 **배달만 예외**로 그대로 둔다: 부름은 수령지에서 이용하고 같은 자리에서 회수해
   * 원래 존으로 돌아오므로(ADR-006 제자리 회수), 배달 때 존을 옮겨 버리면 위치 체인(ADR-005)이
   * 실제와 어긋난다. 차가 존을 떠나 다른 존에 자리 잡는 건 회수·재배치가 끝날 때다.
   */
  private vehicleZoneAfter(task: HandlerTaskRow): string | null {
    if (task.type === 'DELIVERY') return null;
    return task.toZoneId ?? task.fromZoneId;
  }

  /** 전이 위반은 409 — 자원의 현재 상태와 충돌한 요청이지 잘못된 입력이 아니다 */
  private assertTransition(from: HandlerTaskStatusValue, to: HandlerTaskStatusValue) {
    if (!canTransitionHandlerTask(from, to)) {
      throw new ConflictException(
        `${HANDLER_TASK_STATUS_META[from].label} 상태에서는 할 수 없는 동작이에요`,
      );
    }
  }

  private async taskOrThrow(tx: Prisma.TransactionClient, id: string): Promise<HandlerTaskRow> {
    const task = await tx.handlerTask.findUnique({ where: { id }, include: HANDLER_TASK_INCLUDE });
    if (!task) throw new NotFoundException('작업을 찾을 수 없습니다');
    return task;
  }

  /** 남의 작업은 조회는 몰라도 조작은 못 한다 */
  private async ownTask(
    tx: Prisma.TransactionClient,
    user: JwtUser,
    id: string,
  ): Promise<HandlerTaskRow> {
    const task = await this.taskOrThrow(tx, id);
    if (task.assigneeId !== user.id) {
      throw new ForbiddenException('내게 배정된 작업만 처리할 수 있습니다');
    }
    return task;
  }

  /** 단건 응답 — 상세 화면이 지도를 그리므로 이동 시간을 함께 싣는다 */
  private async one(
    task: HandlerTaskRow,
    opts: { photos?: ReturnType<typeof toStoredPhotos> } = {},
  ): Promise<HandlerTaskRes> {
    return toHandlerTaskRes(task, { travel: await this.estimate(task), ...opts });
  }

  private async withTravel(tasks: HandlerTaskRow[], now: Date): Promise<HandlerTaskRes[]> {
    const travels = await Promise.all(tasks.map((t) => this.estimate(t)));
    return tasks.map((t, i) => toHandlerTaskRes(t, { travel: travels[i], now }));
  }

  /** 출발 → 도착 주행 시간 (도로망 A*, 그래프 밖이면 직선거리 폴백) */
  private estimate(task: HandlerTaskRow) {
    return this.travel.estimateDrive(fromPlace(task), toPlace(task), taskRegion(task));
  }
}
