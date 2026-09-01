import { Injectable } from '@nestjs/common';
import type { Prisma, VehicleTelemetry } from '@prisma/client';
import type { SmartKeyState } from '@socar/shared';
import { PrismaService } from '../prisma/prisma.service';
import { initialTelemetry } from './telemetry-defaults';

/** 트랜잭션 안팎에서 같은 헬퍼를 쓰기 위한 클라이언트 타입 */
export type TelemetryDb = PrismaService | Prisma.TransactionClient;

/**
 * 차량 텔레메트리 저장소 (M3-1).
 *
 * 조회 시점 계산(모의 엔진)은 M3-2가 이 위에 얹는다 — 여기서는 "행이 반드시 있게" 하는
 * 책임만 진다. 텔레메트리 행은 차량 생성과 함께 만들어지는 게 원칙이지만, 시드 밖에서
 * 만들어진 차량(테스트·수기 데이터)도 스마트키가 동작해야 하므로 읽을 때 없으면 만든다.
 */
@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  /** 텔레메트리 행을 보장하고 돌려준다 — 없으면 배정 존 좌표로 초기값을 만든다 */
  async ensure(db: TelemetryDb, vehicleId: string): Promise<VehicleTelemetry> {
    const existing = await db.vehicleTelemetry.findUnique({ where: { vehicleId } });
    if (existing) return existing;

    const vehicle = await db.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      include: { zone: { select: { lat: true, lng: true } } },
    });
    return db.vehicleTelemetry.create({
      data: { vehicleId, ...initialTelemetry(vehicleId, vehicle.zone) },
    });
  }

  /** 스마트키 조작 결과를 반영한다 (M1-4의 Vehicle 임시 필드를 대체) */
  async applySmartKey(
    db: TelemetryDb,
    vehicleId: string,
    state: SmartKeyState,
  ): Promise<VehicleTelemetry> {
    await this.ensure(db, vehicleId);
    return db.vehicleTelemetry.update({ where: { vehicleId }, data: state });
  }
}
