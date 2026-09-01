import { Injectable } from '@nestjs/common';
import type { OpsAccountingQueryDto, OpsAccountingSummaryRes } from '@socar/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { summarizeAccounting } from './accounting-calc';

const DAY_MS = 24 * 3600 * 1000;

/**
 * 회계 탭 (M3-3, 화면은 M3-6).
 *
 * 기존 `/metrics/summary·daily`(매출 중심)는 그대로 두고 회계 탭 전용으로 강등한다 —
 * 여기서는 그 매출에 **비용**을 붙여 손익까지 만든다. 합산 규칙은 accounting-calc.ts(순수 함수).
 */
@Injectable()
export class OpsAccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: OpsAccountingQueryDto, now = new Date()): Promise<OpsAccountingSummaryRes> {
    const since = new Date(now.getTime() - query.days * DAY_MS);

    const [payments, activeLeases, finances, zoneContracts, vehicleCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { status: 'CAPTURED', approvedAt: { gte: since } },
        _sum: { amountKrw: true },
      }),
      this.prisma.leaseContract.aggregate({
        where: { status: { not: 'ENDED' } },
        _sum: { monthlyFeeKrw: true },
        _count: { _all: true },
      }),
      this.prisma.vehicleFinance.aggregate({
        _sum: { monthlyLeaseKrw: true, insurancePremiumKrw: true },
      }),
      this.prisma.zoneContract.aggregate({
        where: { isPaid: true },
        _sum: { monthlyFeeKrw: true },
        _count: { _all: true },
      }),
      this.prisma.vehicle.count(),
    ]);

    const leasedVehicleCount = await this.prisma.vehicleFinance.count({
      where: { acquisitionType: 'LEASE' },
    });

    return summarizeAccounting({
      days: query.days,
      rentalRevenueKrw: payments._sum.amountKrw ?? 0,
      leaseRevenueKrw: activeLeases._sum.monthlyFeeKrw ?? 0,
      vehicleLeaseCostKrw: finances._sum.monthlyLeaseKrw ?? 0,
      insuranceCostKrw: finances._sum.insurancePremiumKrw ?? 0,
      zoneContractCostKrw: zoneContracts._sum.monthlyFeeKrw ?? 0,
      counts: {
        vehicleCount,
        leasedVehicleCount,
        paidZoneCount: zoneContracts._count._all,
        activeLeaseCount: activeLeases._count._all,
      },
    });
  }
}
