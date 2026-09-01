import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canTransitionHandlerTask,
  DELIVERY_MIN_LEAD_MINUTES,
  handlerTaskStatusSchema,
  HANDLER_RETRIEVE_DUE_MINUTES,
} from '@socar/shared';

/**
 * 예약 생명주기에서 파생되는 핸들러 작업의 자동 생성/정리 (M2-2).
 *
 * 작업은 예약을 만든/끝낸 **같은 트랜잭션 안에서** 만든다 — 결제는 끝났는데 배달 작업이
 * 없는 상태가 되면 아무도 차를 옮기지 않고, 그 사실을 알아챌 사람도 없다.
 * 그래서 이 서비스의 메서드는 전부 트랜잭션 클라이언트를 받는다.
 *
 * 상태 전이 규칙은 shared(handler-task.ts) 한 벌만 본다.
 */
@Injectable()
export class HandlerTasksService {
  /** 취소 정리 대상 = 전이표가 CANCELED를 허용하는 상태 (PENDING/ASSIGNED) */
  private static readonly CANCELABLE = handlerTaskStatusSchema.options.filter((s) =>
    canTransitionHandlerTask(s, 'CANCELED'),
  );

  /**
   * 부름 예약 결제 완료 → 배달 작업.
   *
   * 출발은 "시작 시각의 유효 존"(위치 체인, ADR-005)이고 도착은 수령지 좌표다.
   * 기한은 이용 시작 − 리드타임 — 탁송 이동 시간이 그 안에 들어간다는 건 예약 시점의
   * 가용성 판정(ADR-006)에서 이미 보장됐으니, 여기서는 약속된 시각만 기록한다.
   */
  async createDeliveryTask(
    tx: Prisma.TransactionClient,
    reservation: {
      id: string;
      vehicleId: string;
      startAt: Date;
      deliveryLat: number | null;
      deliveryLng: number | null;
      deliveryLabel: string | null;
    },
    fromZoneId: string,
  ) {
    if (reservation.deliveryLat === null || reservation.deliveryLng === null) return null;

    return tx.handlerTask.create({
      data: {
        type: 'DELIVERY',
        reservationId: reservation.id,
        vehicleId: reservation.vehicleId,
        fromZoneId,
        toLat: reservation.deliveryLat,
        toLng: reservation.deliveryLng,
        toLabel: reservation.deliveryLabel,
        dueAt: new Date(reservation.startAt.getTime() - DELIVERY_MIN_LEAD_MINUTES * 60 * 1000),
      },
    });
  }

  /**
   * 부름 이용 반납(정산 완료) → 회수 작업.
   *
   * 제자리 회수 정책(ADR-006): 이용자가 수령지에 세워 둔 차를 원래 존으로 되돌린다.
   * "원래 존"은 배달 작업이 출발했던 존이다 — 배달은 vehicle.zoneId를 바꾸지 않으므로
   * 차량의 현재 존과 같지만, 작업 기록에서 직접 읽어 두 값이 어긋날 여지를 없앤다.
   */
  async createRetrieveTask(
    tx: Prisma.TransactionClient,
    reservation: {
      id: string;
      vehicleId: string;
      deliveryLat: number | null;
      deliveryLng: number | null;
      deliveryLabel: string | null;
      vehicle: { zoneId: string };
    },
    now: Date = new Date(),
  ) {
    if (reservation.deliveryLat === null || reservation.deliveryLng === null) return null;

    const delivery = await tx.handlerTask.findFirst({
      where: { reservationId: reservation.id, type: 'DELIVERY' },
      orderBy: { createdAt: 'asc' },
      select: { fromZoneId: true },
    });
    const homeZoneId = delivery?.fromZoneId ?? reservation.vehicle.zoneId;

    return tx.handlerTask.create({
      data: {
        type: 'RETRIEVE',
        reservationId: reservation.id,
        vehicleId: reservation.vehicleId,
        fromZoneId: homeZoneId,
        // 출발은 이용자가 차를 세워 둔 수령지(좌표), 도착은 되돌릴 존
        fromLat: reservation.deliveryLat,
        fromLng: reservation.deliveryLng,
        fromLabel: reservation.deliveryLabel,
        toZoneId: homeZoneId,
        dueAt: new Date(now.getTime() + HANDLER_RETRIEVE_DUE_MINUTES * 60 * 1000),
      },
    });
  }

  /**
   * 예약 취소 → 연결된 작업 정리.
   *
   * 이미 이동을 시작한 작업(EN_ROUTE)은 건드리지 않는다 — 차가 도로 위에 있는데 작업만
   * 사라지면 차량의 실제 위치를 아무도 책임지지 않는다(전이표가 EN_ROUTE→CANCELED를
   * 막아 두는 이유). 그 작업은 핸들러가 완료로 닫는다.
   */
  async cancelForReservation(tx: Prisma.TransactionClient, reservationId: string, reason: string) {
    const { count } = await tx.handlerTask.updateMany({
      where: { reservationId, status: { in: HandlerTasksService.CANCELABLE } },
      data: { status: 'CANCELED', canceledAt: new Date(), cancelReason: reason },
    });
    return count;
  }
}
