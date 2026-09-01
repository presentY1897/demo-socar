import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LEASE_STATUS_LABELS,
  LeaseStatus,
  type BizLeaseRes,
  type ExtendLeaseRequestDto,
  type LeaseStatus as LeaseStatusType,
  type TerminateLeaseRequestDto,
} from '@socar/shared';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { toLeaseRes, type LeaseWithRequester } from './lease-view';

/**
 * 리스 연장/해지 **요청**(법인 쪽). 결정은 운영 어드민(`/ops/leases`)이 한다 —
 * 법인이 스스로 계약 만기를 바꿀 수 있으면 계약이 아니게 되므로, 여기서는
 * 상태를 "처리 대기"로 올리는 것까지만 한다.
 *
 *   ACTIVE ──연장 요청──> EXTENSION_REQUESTED ──ops 승인──> ACTIVE(endAt 연장)
 *                                             └─ops 반려──> ACTIVE
 *   ACTIVE ──해지 요청──> TERMINATION_REQUESTED ─ops 승인──> ENDED
 *                                               └ops 반려──> ACTIVE
 */
@Injectable()
export class LeasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: JwtUser): Promise<BizLeaseRes[]> {
    const corporationId = this.corpOf(actor);
    const now = new Date();
    const leases = await this.prisma.leaseContract.findMany({
      where: { corporationId },
      include: {
        requestedBy: { select: { id: true, name: true } },
        vehicle: { select: { id: true, modelName: true, plateNo: true } },
      },
      orderBy: [{ status: 'asc' }, { endAt: 'asc' }],
    });
    return leases.map((l) => ({ ...toLeaseRes(l, now), vehicle: l.vehicle }));
  }

  /** 연장 요청 — 희망 만기는 현재 만기 이후여야 한다 */
  async requestExtension(
    actor: JwtUser,
    leaseId: string,
    dto: ExtendLeaseRequestDto,
  ): Promise<BizLeaseRes> {
    const lease = await this.findOwned(actor, leaseId);
    this.assertRequestable(lease.status as LeaseStatusType);

    const requestedEndAt = new Date(dto.requestedEndAt);
    if (requestedEndAt.getTime() <= lease.endAt.getTime()) {
      throw new BadRequestException('희망 만기는 현재 만기 이후여야 합니다');
    }

    return this.update(leaseId, {
      status: LeaseStatus.EXTENSION_REQUESTED,
      requestedById: actor.id,
      requestedAt: new Date(),
      requestedEndAt,
      requestNote: dto.note ?? null,
    });
  }

  /** 해지 요청 — 실제 종료 시각(endedAt)은 운영 어드민이 승인할 때 찍힌다 */
  async requestTermination(
    actor: JwtUser,
    leaseId: string,
    dto: TerminateLeaseRequestDto,
  ): Promise<BizLeaseRes> {
    const lease = await this.findOwned(actor, leaseId);
    this.assertRequestable(lease.status as LeaseStatusType);

    return this.update(leaseId, {
      status: LeaseStatus.TERMINATION_REQUESTED,
      requestedById: actor.id,
      requestedAt: new Date(),
      requestedEndAt: null,
      requestNote: dto.note ?? null,
    });
  }

  /** 계약을 읽고 테넌시(다른 법인 침범)만 확인 — 등급 권한은 가드가 판정했다 */
  private async findOwned(actor: JwtUser, leaseId: string) {
    const corporationId = this.corpOf(actor);
    const lease = await this.prisma.leaseContract.findUnique({ where: { id: leaseId } });
    if (!lease) throw new NotFoundException('리스 계약을 찾을 수 없습니다');
    if (lease.corporationId !== corporationId) {
      throw new ForbiddenException('다른 법인의 리스 계약입니다');
    }
    return lease;
  }

  /** 요청은 계약 중(ACTIVE)일 때만 — 이미 처리 대기면 중복, 종료된 계약이면 대상 없음 */
  private assertRequestable(status: LeaseStatusType) {
    if (status === LeaseStatus.ACTIVE) return;
    if (status === LeaseStatus.ENDED) {
      throw new ConflictException('이미 종료된 계약입니다');
    }
    throw new ConflictException(
      `이미 처리 대기 중인 요청이 있습니다 (${LEASE_STATUS_LABELS[status]})`,
    );
  }

  private async update(
    leaseId: string,
    data: Parameters<PrismaService['leaseContract']['update']>[0]['data'],
  ): Promise<BizLeaseRes> {
    const updated = await this.prisma.leaseContract.update({
      where: { id: leaseId },
      data,
      include: {
        requestedBy: { select: { id: true, name: true } },
        vehicle: { select: { id: true, modelName: true, plateNo: true } },
      },
    });
    return { ...toLeaseRes(updated as LeaseWithRequester), vehicle: updated.vehicle };
  }

  private corpOf(actor: JwtUser): string {
    if (!actor.corporationId) throw new ForbiddenException('법인 소속이 아닙니다');
    return actor.corporationId;
  }
}
