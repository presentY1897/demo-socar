import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Corporation, LeaseContract, User, Vehicle } from '@prisma/client';
import {
  isLeaseExpiringSoon,
  isLeasePending,
  leaseDDay,
  LeaseStatus,
  type ApproveLeaseRequestDto,
  type LeaseStatus as LeaseStatusType,
  type OpsLeaseRes,
  type RejectLeaseRequestDto,
} from '@socar/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 목록·상세가 함께 읽는 관계 (법인·차량·요청자 표기) */
const WITH_RELATIONS = {
  requestedBy: { select: { id: true, name: true } },
  vehicle: { select: { id: true, modelName: true, plateNo: true } },
  corporation: { select: { id: true, name: true } },
} as const;

type OpsLease = LeaseContract & {
  requestedBy: Pick<User, 'id' | 'name'> | null;
  vehicle: Pick<Vehicle, 'id' | 'modelName' | 'plateNo'>;
  corporation: Pick<Corporation, 'id' | 'name'>;
};

/**
 * 리스 연장/해지 요청 처리 (운영 어드민 = MOCAR 쪽).
 *
 * 법인(biz)은 요청까지, 결정은 여기서 한다 — 그래서 두 컨텍스트가 같은 LeaseContract를
 * 보되 만들 수 있는 상태가 다르다:
 *   biz → EXTENSION_REQUESTED / TERMINATION_REQUESTED
 *   ops → ACTIVE(연장 반영 · 반려) / ENDED(해지 승인)
 * 응답 매핑도 biz와 공유하지 않고 각자 갖는다 — 컨텍스트를 떼어낼 때 잘라내는 선이라서.
 */
@Injectable()
export class OpsLeasesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 계약 목록 — 처리 대기가 먼저, 그다음 만기 임박 순 */
  async list(status?: string): Promise<OpsLeaseRes[]> {
    if (status && !(status in LeaseStatus)) {
      throw new BadRequestException('알 수 없는 계약 상태입니다');
    }
    const now = new Date();
    const leases = await this.prisma.leaseContract.findMany({
      where: status ? { status: status as LeaseStatusType } : undefined,
      include: WITH_RELATIONS,
    });

    return leases
      .map((lease) => this.toRes(lease, now))
      .sort((a, b) => {
        const pending = Number(isLeasePending(b.status)) - Number(isLeasePending(a.status));
        return pending !== 0 ? pending : a.dDay - b.dDay;
      });
  }

  /**
   * 승인 — 연장이면 만기를 희망 만기로 옮기고, 해지면 계약을 종료한다.
   *
   * 해지 승인 시 차량 회수(REPOSITION) 작업 생성은 M2(운영 작업) 완료 후 붙인다.
   * 지금은 계약 상태만 바꾸고 차량 배정은 건드리지 않는다 — 전용 차량을 즉시 회수하면
   * 이미 잡힌 배차/예약이 깨지기 때문에, 회수는 운영 작업으로 다뤄야 할 일이다.
   */
  async approve(leaseId: string, dto: ApproveLeaseRequestDto): Promise<OpsLeaseRes> {
    const lease = await this.findPending(leaseId);

    if (lease.status === LeaseStatus.EXTENSION_REQUESTED) {
      if (!lease.requestedEndAt) throw new ConflictException('희망 만기가 없는 연장 요청입니다');
      return this.applyAndReturn(leaseId, {
        status: LeaseStatus.ACTIVE,
        endAt: lease.requestedEndAt,
        requestedEndAt: null,
        requestNote: dto.note ?? lease.requestNote,
      });
    }

    return this.applyAndReturn(leaseId, {
      status: LeaseStatus.ENDED,
      endedAt: new Date(),
      requestedEndAt: null,
      requestNote: dto.note ?? lease.requestNote,
    });
  }

  /** 반려 — 계약은 원래대로 돌아가고, 사유는 계약의 최근 메모로 남는다 */
  async reject(leaseId: string, dto: RejectLeaseRequestDto): Promise<OpsLeaseRes> {
    await this.findPending(leaseId);
    return this.applyAndReturn(leaseId, {
      status: LeaseStatus.ACTIVE,
      requestedEndAt: null,
      // 전용 반려 필드를 새로 만들지 않고(추가 마이그레이션 없음) 최근 메모로 남긴다
      requestNote: `반려: ${dto.reason}`,
    });
  }

  /** 처리 대기 상태에서만 결정할 수 있다 — 이미 처리된 요청 재처리는 409 */
  private async findPending(leaseId: string) {
    const lease = await this.prisma.leaseContract.findUnique({ where: { id: leaseId } });
    if (!lease) throw new NotFoundException('리스 계약을 찾을 수 없습니다');
    if (!isLeasePending(lease.status as LeaseStatusType)) {
      throw new ConflictException('처리 대기 중인 요청이 아닙니다');
    }
    return lease;
  }

  private async applyAndReturn(
    leaseId: string,
    data: Parameters<PrismaService['leaseContract']['update']>[0]['data'],
  ): Promise<OpsLeaseRes> {
    const updated = await this.prisma.leaseContract.update({
      where: { id: leaseId },
      data,
      include: WITH_RELATIONS,
    });
    return this.toRes(updated, new Date());
  }

  private toRes(lease: OpsLease, now: Date): OpsLeaseRes {
    const dDay = leaseDDay(lease.endAt, now);
    return {
      id: lease.id,
      corporationId: lease.corporationId,
      vehicleId: lease.vehicleId,
      monthlyFeeKrw: lease.monthlyFeeKrw,
      startAt: lease.startAt.toISOString(),
      endAt: lease.endAt.toISOString(),
      status: lease.status as LeaseStatusType,
      dDay,
      expiringSoon: lease.status !== LeaseStatus.ENDED && isLeaseExpiringSoon(dDay),
      endedAt: lease.endedAt?.toISOString() ?? null,
      requestedAt: lease.requestedAt?.toISOString() ?? null,
      requestedEndAt: lease.requestedEndAt?.toISOString() ?? null,
      requestNote: lease.requestNote,
      requestedBy: lease.requestedBy,
      vehicle: lease.vehicle,
      corporation: lease.corporation,
    };
  }
}
