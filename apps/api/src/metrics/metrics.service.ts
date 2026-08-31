import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 핵심 지표 요약 (최근 N일) */
  async summary(days: number) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const [vehicleCount, reservationAgg, revenueAgg, rentalStats, activeRentals] =
      await Promise.all([
        this.prisma.vehicle.count(),
        this.prisma.reservation.aggregate({
          where: { createdAt: { gte: since }, status: { not: 'CANCELED' } },
          _count: true,
        }),
        this.prisma.payment.aggregate({
          where: { status: 'CAPTURED', approvedAt: { gte: since } },
          _sum: { amountKrw: true },
        }),
        this.prisma.rental.groupBy({
          by: ['status'],
          where: { startedAt: { gte: since } },
          _count: true,
        }),
        this.prisma.rental.count({ where: { status: 'IN_USE' } }),
      ]);

    // 가동률: 예약된 시간 / (차량 수 × 기간)
    const reservedHours = await this.prisma.$queryRaw<{ hours: number | null }[]>`
      SELECT SUM(EXTRACT(EPOCH FROM (LEAST("endAt", NOW()) - GREATEST("startAt", ${since}))) / 3600) AS hours
      FROM "Reservation"
      WHERE "status" IN ('CONFIRMED', 'IN_USE', 'COMPLETED')
        AND "endAt" > ${since} AND "startAt" < NOW()
    `;
    const totalVehicleHours = vehicleCount * days * 24;
    const utilizationPct =
      totalVehicleHours > 0
        ? Math.round(((reservedHours[0]?.hours ?? 0) / totalVehicleHours) * 1000) / 10
        : 0;

    const lateStats = await this.prisma.rental.aggregate({
      where: { status: 'COMPLETED', returnedAt: { gte: since } },
      _count: true,
    });
    const lateCount = await this.prisma.rental.count({
      where: { status: 'COMPLETED', returnedAt: { gte: since }, lateMinutes: { gt: 0 } },
    });

    return {
      days,
      vehicleCount,
      reservationCount: reservationAgg._count,
      revenueKrw: revenueAgg._sum.amountKrw ?? 0,
      utilizationPct,
      lateReturnPct:
        lateStats._count > 0 ? Math.round((lateCount / lateStats._count) * 1000) / 10 : 0,
      activeRentals,
      rentalsByStatus: Object.fromEntries(rentalStats.map((r) => [r.status, r._count])),
    };
  }

  /** 일별 예약 수 / 매출 (KST 기준, 차트용) */
  async daily(days: number) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const rows = await this.prisma.$queryRaw<
      { day: string; reservations: bigint; revenue: bigint | null }[]
    >(Prisma.sql`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${since} AT TIME ZONE 'Asia/Seoul'),
          date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul'),
          interval '1 day'
        )::date AS day
      ),
      resv AS (
        SELECT date_trunc('day', "startAt" AT TIME ZONE 'Asia/Seoul')::date AS day, COUNT(*) AS cnt
        FROM "Reservation"
        WHERE "startAt" >= ${since} AND "status" != 'CANCELED'
        GROUP BY 1
      ),
      pay AS (
        SELECT date_trunc('day', "approvedAt" AT TIME ZONE 'Asia/Seoul')::date AS day, SUM("amountKrw") AS amount
        FROM "Payment"
        WHERE "approvedAt" >= ${since} AND "status" = 'CAPTURED'
        GROUP BY 1
      )
      SELECT days.day::text AS day,
             COALESCE(resv.cnt, 0) AS reservations,
             COALESCE(pay.amount, 0) AS revenue
      FROM days
      LEFT JOIN resv ON resv.day = days.day
      LEFT JOIN pay ON pay.day = days.day
      ORDER BY days.day
    `);
    return rows.map((r) => ({
      day: r.day,
      reservations: Number(r.reservations),
      revenueKrw: Number(r.revenue ?? 0),
    }));
  }

  /** 실시간 차량 현황 (SSE 페이로드) */
  async liveVehicles() {
    const vehicles = await this.prisma.vehicle.findMany({
      include: {
        zone: { select: { name: true, region: true, lat: true, lng: true } },
        reservations: {
          where: { status: 'IN_USE' },
          include: { user: { select: { name: true } }, rental: true },
          take: 1,
        },
      },
      orderBy: { plateNo: 'asc' },
    });
    return vehicles.map((v) => {
      const active = v.reservations[0];
      return {
        id: v.id,
        modelName: v.modelName,
        plateNo: v.plateNo,
        zone: v.zone,
        state: v.status === 'MAINTENANCE' ? 'MAINTENANCE' : active ? 'IN_USE' : 'AVAILABLE',
        activeSince: active?.rental?.startedAt ?? null,
        dueBack: active?.endAt ?? null,
      };
    });
  }
}
