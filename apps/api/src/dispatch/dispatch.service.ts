import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  haversineMeters,
  validateSlotRange,
  type CreateDispatchRequestDto,
} from '@socar/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { effectiveZoneIdAt } from '../common/vehicle-location';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { rankCandidates, type CandidateInput } from './scoring';
import { TRAVEL_ESTIMATOR, type TravelTimeEstimator } from './travel/travel-time';

/** 오피스에서 걸어갈 수 있다고 보는 최대 반경(직선거리 프리필터) */
const CANDIDATE_RADIUS_M = 3000;
const TOP_N = 3;

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    @Inject(TRAVEL_ESTIMATOR) private readonly travel: TravelTimeEstimator,
  ) {}

  /** 임직원의 배차 요청 접수 → 즉시 후보 추천까지 수행 */
  async createRequest(user: JwtUser, dto: CreateDispatchRequestDto) {
    if (!user.corporationId) throw new ForbiddenException('법인 소속만 배차를 요청할 수 있습니다');

    const startAt = new Date(dto.desiredStartAt);
    const endAt = new Date(dto.desiredEndAt);
    const rangeError = validateSlotRange(startAt, endAt);
    if (rangeError) throw new BadRequestException(rangeError);
    if (startAt.getTime() < Date.now()) {
      throw new BadRequestException('과거 시각으로는 요청할 수 없습니다');
    }

    const corp = await this.prisma.corporation.findUniqueOrThrow({
      where: { id: user.corporationId },
    });

    const request = await this.prisma.dispatchRequest.create({
      data: {
        corporationId: corp.id,
        requesterId: user.id,
        purpose: dto.purpose,
        originLabel: corp.name,
        originLat: corp.officeLat,
        originLng: corp.officeLng,
        desiredStartAt: startAt,
        desiredEndAt: endAt,
      },
    });

    await this.recommend(request.id);
    return this.detail(user, request.id);
  }

  /** 후보 차량 탐색 → 스코어링 → 상위 N개 저장 */
  async recommend(requestId: string) {
    const request = await this.prisma.dispatchRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    const origin = { lat: request.originLat, lng: request.originLng };

    // 1) 후보 존: 반경 내 공유존(직선거리 프리필터) + 이 법인의 전용존
    const allZones = await this.prisma.zone.findMany();
    const zones = allZones.filter(
      (z) =>
        z.corporationId === request.corporationId ||
        (z.corporationId === null &&
          haversineMeters(origin, { lat: z.lat, lng: z.lng }) <= CANDIDATE_RADIUS_M),
    );
    if (zones.length === 0) {
      await this.prisma.dispatchRequest.update({
        where: { id: requestId },
        data: { status: 'RECOMMENDED' },
      });
      return;
    }
    const zoneById = new Map(zones.map((z) => [z.id, z]));

    // 2) 가용 차량 + 시간 겹침 필터
    //    법인 전용 차량(FMS) 우선 대상 + 인근 공유존 차량 폴백을 한 풀에서 스코어링
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        zoneId: { in: zones.map((z) => z.id) },
        status: 'AVAILABLE',
        OR: [{ corporationId: null }, { corporationId: request.corporationId }],
      },
      include: {
        // 미완료 예약 전체 — 겹침·직전 버퍼·편도 위치 체인 계산에 사용
        reservations: {
          where: {
            status: { in: ['CONFIRMED', 'IN_USE'] },
            startAt: { lt: request.desiredEndAt },
          },
          orderBy: { endAt: 'asc' },
        },
      },
    });

    const feasible = vehicles.filter(
      (v) =>
        !v.reservations.some(
          (r) => r.startAt < request.desiredEndAt && r.endAt > request.desiredStartAt,
        ),
    );

    // 3) 차량별 지연 반납 리스크 (최근 30일, 표본 3건 미만이면 전체 평균 사용)
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const rentals = await this.prisma.rental.findMany({
      where: { status: 'COMPLETED', returnedAt: { gte: since } },
      select: { lateMinutes: true, reservation: { select: { vehicleId: true } } },
    });
    const byVehicle = new Map<string, { total: number; late: number }>();
    let fleetTotal = 0;
    let fleetLate = 0;
    for (const r of rentals) {
      const key = r.reservation.vehicleId;
      const cur = byVehicle.get(key) ?? { total: 0, late: 0 };
      cur.total += 1;
      if (r.lateMinutes > 0) cur.late += 1;
      byVehicle.set(key, cur);
      fleetTotal += 1;
      if (r.lateMinutes > 0) fleetLate += 1;
    }
    const fleetAvgPct = fleetTotal > 0 ? (fleetLate / fleetTotal) * 100 : 0;

    // 4) 이동시간 추정 + 스코어링 — 존 위치는 편도 체인 반영 (희망 시작 시각 기준)
    const inputs: CandidateInput[] = [];
    for (const v of feasible) {
      const effZoneId = effectiveZoneIdAt(v.zoneId, v.reservations, request.desiredStartAt);
      const zone = zoneById.get(effZoneId);
      if (!zone) continue; // 편도로 반경 밖에 있을 예정인 차량
      const est = await this.travel.estimateWalk(
        origin,
        { lat: zone.lat, lng: zone.lng },
        zone.region,
      );

      const prev = v.reservations
        .filter((r) => r.endAt <= request.desiredStartAt)
        .at(-1);
      const bufferMinutes = prev
        ? Math.round((request.desiredStartAt.getTime() - prev.endAt.getTime()) / 60000)
        : null;

      const stats = byVehicle.get(v.id);
      const lateRiskPct =
        stats && stats.total >= 3 ? (stats.late / stats.total) * 100 : fleetAvgPct;

      inputs.push({
        vehicleId: v.id,
        zoneName: zone.name,
        walkSeconds: est.seconds,
        walkMeters: est.meters,
        travelMethod: est.method,
        bufferMinutes,
        lateRiskPct,
        isDedicated: v.corporationId === request.corporationId && v.corporationId !== null,
      });
    }

    const ranked = rankCandidates(inputs).slice(0, TOP_N);

    await this.prisma.$transaction([
      this.prisma.dispatchCandidate.deleteMany({ where: { requestId } }),
      this.prisma.dispatchCandidate.createMany({
        data: ranked.map((c) => ({
          requestId,
          vehicleId: c.vehicleId,
          rank: c.rank,
          score: c.score,
          isDedicated: c.isDedicated,
          walkSeconds: c.walkSeconds,
          walkMeters: c.walkMeters,
          bufferMinutes: c.bufferMinutes ?? 9999,
          lateRiskPct: Math.round(c.lateRiskPct * 10) / 10,
          reasons: c.reasons,
        })),
      }),
      this.prisma.dispatchRequest.update({
        where: { id: requestId },
        data: { status: 'RECOMMENDED' },
      }),
    ]);
  }

  async list(user: JwtUser) {
    if (!user.corporationId) throw new ForbiddenException('법인 소속이 아닙니다');
    const where =
      user.role === 'CORP_ADMIN'
        ? { corporationId: user.corporationId }
        : { requesterId: user.id };
    return this.prisma.dispatchRequest.findMany({
      where,
      include: {
        requester: { select: { name: true, email: true } },
        candidates: { include: { vehicle: { include: { zone: true } } }, orderBy: { rank: 'asc' } },
        reservation: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async detail(user: JwtUser, id: string) {
    const request = await this.prisma.dispatchRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        candidates: { include: { vehicle: { include: { zone: true, plan: true } } }, orderBy: { rank: 'asc' } },
        reservation: true,
        decidedBy: { select: { name: true } },
      },
    });
    if (!request) throw new NotFoundException('배차 요청을 찾을 수 없습니다');
    const sameCorp = request.corporationId === user.corporationId;
    const canView =
      request.requesterId === user.id ||
      (sameCorp && user.role === 'CORP_ADMIN') ||
      user.role === 'OPS_ADMIN';
    if (!canView) throw new ForbiddenException('조회 권한이 없습니다');
    return request;
  }

  /** 담당자 승인 → 예약 생성 (예약과 동일한 동시성 방어를 그대로 통과) */
  async approve(admin: JwtUser, requestId: string, candidateId: string) {
    const request = await this.detail(admin, requestId);
    if (admin.role !== 'CORP_ADMIN' || request.corporationId !== admin.corporationId) {
      throw new ForbiddenException('배차 담당자만 승인할 수 있습니다');
    }
    if (request.status !== 'RECOMMENDED') {
      throw new BadRequestException('결정 대기 상태의 요청만 승인할 수 있습니다');
    }
    const candidate = request.candidates.find((c) => c.id === candidateId);
    if (!candidate) throw new NotFoundException('해당 추천 후보를 찾을 수 없습니다');

    const requester = await this.prisma.user.findUniqueOrThrow({
      where: { id: request.requesterId },
    });

    let reservation;
    try {
      reservation = await this.reservations.create(
        {
          id: requester.id,
          email: requester.email,
          name: requester.name,
          role: requester.role,
          corporationId: requester.corporationId,
        },
        {
          vehicleId: candidate.vehicleId,
          startAt: request.desiredStartAt.toISOString(),
          endAt: request.desiredEndAt.toISOString(),
          insurance: 'STANDARD',
          useCredit: false,
          cardLast4: '9999', // 법인카드 (모의)
          idempotencyKey: `dispatch-${requestId}`,
        },
        // 전용 차량(FMS)은 과금 없이 예약 — 동시성 방어는 동일 경로
        { corporateDedicated: candidate.isDedicated },
      );
    } catch (e) {
      if (e instanceof ConflictException) {
        // 추천 이후 다른 예약이 선점한 경우 — 후보를 다시 계산해 담당자가 재선택
        await this.recommend(requestId);
        throw new ConflictException(
          '추천 이후 해당 차량이 선점되었습니다. 후보를 갱신했으니 다시 선택해 주세요',
        );
      }
      throw e;
    }

    return this.prisma.dispatchRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        reservationId: reservation.id,
        decidedById: admin.id,
        decidedAt: new Date(),
      },
      include: { reservation: true },
    });
  }

  async reject(admin: JwtUser, requestId: string, reason: string) {
    const request = await this.detail(admin, requestId);
    if (admin.role !== 'CORP_ADMIN' || request.corporationId !== admin.corporationId) {
      throw new ForbiddenException('배차 담당자만 반려할 수 있습니다');
    }
    if (request.status !== 'RECOMMENDED' && request.status !== 'REQUESTED') {
      throw new BadRequestException('결정 대기 상태의 요청만 반려할 수 있습니다');
    }
    return this.prisma.dispatchRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        rejectReason: reason,
        decidedById: admin.id,
        decidedAt: new Date(),
      },
    });
  }

  /** 차량 × 시간 타임라인 보드 (KST 기준 하루) */
  async board(admin: JwtUser, date: string) {
    if (admin.role !== 'CORP_ADMIN' || !admin.corporationId) {
      throw new ForbiddenException('배차 담당자만 조회할 수 있습니다');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date=YYYY-MM-DD 형식이 필요합니다');
    }
    const corp = await this.prisma.corporation.findUniqueOrThrow({
      where: { id: admin.corporationId },
    });
    const dayStart = new Date(`${date}T00:00:00+09:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

    const zones = (await this.prisma.zone.findMany()).filter(
      (z) =>
        z.corporationId === corp.id ||
        (z.corporationId === null &&
          haversineMeters(
            { lat: corp.officeLat, lng: corp.officeLng },
            { lat: z.lat, lng: z.lng },
          ) <= CANDIDATE_RADIUS_M),
    );

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        zoneId: { in: zones.map((z) => z.id) },
        OR: [{ corporationId: null }, { corporationId: corp.id }],
      },
      include: {
        zone: true,
        reservations: {
          where: {
            status: { in: ['CONFIRMED', 'IN_USE', 'COMPLETED'] },
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
          },
          include: {
            user: { select: { name: true } },
            dispatch: { select: { id: true, purpose: true } },
          },
          orderBy: { startAt: 'asc' },
        },
      },
      orderBy: { modelName: 'asc' },
    });

    const requests = await this.prisma.dispatchRequest.findMany({
      where: {
        corporationId: admin.corporationId,
        desiredStartAt: { lt: dayEnd },
        desiredEndAt: { gt: dayStart },
      },
      include: {
        requester: { select: { name: true } },
        candidates: { include: { vehicle: { include: { zone: true } } }, orderBy: { rank: 'asc' } },
      },
      orderBy: { desiredStartAt: 'asc' },
    });

    return { date, office: corp, zones, vehicles, requests };
  }
}
