import { Injectable, NotFoundException } from '@nestjs/common';
import {
  isUserAtRisk,
  USER_RISK_WINDOW_DAYS,
  userRiskScore,
  type OpsUserDetailRes,
  type OpsUserRiskRes,
} from '@socar/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 유저 클릭 시 여는 이력 길이 */
const HISTORY_LIMIT = 10;
const DAY_MS = 24 * 3600 * 1000;

/**
 * 고객 탭의 "유의 유저" (M3-3, 화면은 M3-5).
 *
 * 별도 모델을 두지 않고 집계로 만든다 — 리스크는 저장할 상태가 아니라 지금 데이터를 보는
 * 방식이라서, 저장해 두면 원본과 어긋난 채로 남는다.
 * 임계치와 점수 규칙은 shared(USER_RISK_THRESHOLDS · userRiskScore)가 단일 소스다.
 *
 * 3종을 각각 groupBy 한 번씩으로 끝낸다 (유저 수만큼 질의하지 않는다).
 */
@Injectable()
export class OpsUsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 임계치를 넘은 유저만 — 점수 높은 순 */
  async risk(now = new Date()): Promise<OpsUserRiskRes[]> {
    const since = new Date(now.getTime() - USER_RISK_WINDOW_DAYS * DAY_MS);

    const [lateRentals, incidents, payFails] = await Promise.all([
      this.prisma.rental.findMany({
        where: { returnedAt: { gte: since }, lateMinutes: { gt: 0 } },
        select: { returnedAt: true, reservation: { select: { userId: true } } },
      }),
      this.prisma.incidentReport.findMany({
        where: { createdAt: { gte: since } },
        select: { rental: { select: { reservation: { select: { userId: true } } } } },
      }),
      this.prisma.payment.groupBy({
        by: ['reservationId'],
        where: { status: 'FAILED', createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map<string, { late: number; incident: number; payFail: number; lastLateAt: Date | null }>();
    const bucket = (userId: string) => {
      const found = counts.get(userId) ?? { late: 0, incident: 0, payFail: 0, lastLateAt: null };
      counts.set(userId, found);
      return found;
    };

    for (const r of lateRentals) {
      const b = bucket(r.reservation.userId);
      b.late++;
      if (!b.lastLateAt || (r.returnedAt && r.returnedAt > b.lastLateAt)) b.lastLateAt = r.returnedAt;
    }
    for (const i of incidents) bucket(i.rental.reservation.userId).incident++;

    if (payFails.length > 0) {
      // 결제는 예약에 달려 있어 유저를 알려면 예약을 한 번 더 읽어야 한다 (여전히 질의 1회)
      const reservations = await this.prisma.reservation.findMany({
        where: { id: { in: payFails.map((p) => p.reservationId) } },
        select: { id: true, userId: true },
      });
      const userByReservation = new Map(reservations.map((r) => [r.id, r.userId]));
      for (const p of payFails) {
        const userId = userByReservation.get(p.reservationId);
        if (userId) bucket(userId).payFail += p._count._all;
      }
    }

    const atRisk = [...counts.entries()]
      .map(([userId, c]) => ({
        userId,
        lateReturnCount: c.late,
        incidentCount: c.incident,
        paymentFailCount: c.payFail,
        lastLateAt: c.lastLateAt,
      }))
      .filter(isUserAtRisk);
    if (atRisk.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: atRisk.map((r) => r.userId) } },
      select: { id: true, name: true, email: true, role: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return atRisk
      .flatMap((r) => {
        const user = userById.get(r.userId);
        if (!user) return [];
        return [
          {
            ...user,
            lateReturnCount: r.lateReturnCount,
            incidentCount: r.incidentCount,
            paymentFailCount: r.paymentFailCount,
            riskScore: userRiskScore(r),
            lastLateAt: r.lastLateAt?.toISOString() ?? null,
          },
        ];
      })
      .sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name));
  }

  /** 유저 상세 — 최근 예약/사고 이력 (M3-5에서 행을 펼칠 때) */
  async detail(userId: string, now = new Date()): Promise<OpsUserDetailRes> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');

    const [reservations, incidents, risk] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { userId },
        orderBy: { startAt: 'desc' },
        take: HISTORY_LIMIT,
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          vehicle: { select: { modelName: true, plateNo: true } },
          rental: { select: { lateMinutes: true, distanceKm: true } },
        },
      }),
      this.prisma.incidentReport.findMany({
        where: { rental: { reservation: { userId } } },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
      }),
      this.risk(now),
    ]);

    // 리스크 집계는 목록과 같은 값을 쓴다 — 임계치를 못 넘은 유저는 0으로 채운다
    const counts = risk.find((r) => r.id === userId);
    return {
      ...user,
      lateReturnCount: counts?.lateReturnCount ?? 0,
      incidentCount: counts?.incidentCount ?? 0,
      paymentFailCount: counts?.paymentFailCount ?? 0,
      riskScore: counts?.riskScore ?? 0,
      lastLateAt: counts?.lastLateAt ?? null,
      recentReservations: reservations.map((r) => ({
        id: r.id,
        startAt: r.startAt.toISOString(),
        endAt: r.endAt.toISOString(),
        status: r.status,
        vehicle: r.vehicle,
        lateMinutes: r.rental?.lateMinutes ?? 0,
        distanceKm: r.rental?.distanceKm ?? null,
      })),
      recentIncidents: incidents.map((i) => ({
        id: i.id,
        rentalId: i.rentalId,
        description: i.description,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  }
}
