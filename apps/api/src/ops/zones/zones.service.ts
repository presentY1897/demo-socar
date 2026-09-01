import { Injectable, NotFoundException } from '@nestjs/common';
import type { ZoneContract } from '@prisma/client';
import {
  expiryDDay,
  isExpiringSoon,
  type OpsZoneRes,
  type UpdateZoneContractDto,
} from '@socar/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 존/계약 탭 (M3-3, 화면은 M3-5).
 *
 * 잔여 자리는 계약이 아니라 존의 속성으로 계산한다: `capacity − 현재 배정 차량 수`.
 * 음수(초과 배정)를 0으로 깎지 않는다 — 자리가 모자란다는 사실을 화면에서 숨기면
 * 그 존에 차를 더 보내는 일이 계속 일어난다.
 */
@Injectable()
export class OpsZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(now = new Date()): Promise<OpsZoneRes[]> {
    const zones = await this.prisma.zone.findMany({
      include: { contract: true, _count: { select: { vehicles: true } } },
      orderBy: { name: 'asc' },
    });
    return zones.map((z) => this.toRes(z, z._count.vehicles, now));
  }

  /** 계약 수정 — 계약이 없던 존이면 새로 만든다 */
  async updateContract(
    zoneId: string,
    dto: UpdateZoneContractDto,
    now = new Date(),
  ): Promise<OpsZoneRes> {
    const zone = await this.prisma.zone.findUnique({
      where: { id: zoneId },
      include: { _count: { select: { vehicles: true } } },
    });
    if (!zone) throw new NotFoundException('존을 찾을 수 없습니다');

    const data = {
      isPaid: dto.isPaid,
      partnerName: dto.partnerName ?? null,
      monthlyFeeKrw: dto.monthlyFeeKrw,
      contractStart: dto.contractStart ? new Date(dto.contractStart) : null,
      contractEnd: dto.contractEnd ? new Date(dto.contractEnd) : null,
    };
    const contract = await this.prisma.zoneContract.upsert({
      where: { zoneId },
      create: { zoneId, ...data },
      update: data,
    });

    return this.toRes({ ...zone, contract }, zone._count.vehicles, now);
  }

  private toRes(
    zone: {
      id: string;
      name: string;
      region: string;
      address: string;
      lat: number;
      lng: number;
      capacity: number;
      corporationId: string | null;
      contract: ZoneContract | null;
    },
    assignedCount: number,
    now: Date,
  ): OpsZoneRes {
    const c = zone.contract;
    const dDay = c?.contractEnd ? expiryDDay(c.contractEnd, now) : null;
    return {
      id: zone.id,
      name: zone.name,
      region: zone.region,
      address: zone.address,
      lat: zone.lat,
      lng: zone.lng,
      capacity: zone.capacity,
      corporationId: zone.corporationId,
      assignedCount,
      freeSlots: zone.capacity - assignedCount,
      contract: c
        ? {
            isPaid: c.isPaid,
            partnerName: c.partnerName,
            monthlyFeeKrw: c.monthlyFeeKrw,
            contractStart: c.contractStart?.toISOString() ?? null,
            contractEnd: c.contractEnd?.toISOString() ?? null,
            dDay,
            expiringSoon: dDay !== null && isExpiringSoon(dDay),
          }
        : null,
    };
  }
}
