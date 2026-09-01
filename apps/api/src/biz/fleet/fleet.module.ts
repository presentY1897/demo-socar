import { Module } from '@nestjs/common';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { LeasesController } from './leases.controller';
import { LeasesService } from './leases.service';

/**
 * 법인 플릿 · 리스 계약 (biz 컨텍스트). URL은 `/biz/fleet/*`, `/biz/leases/*`.
 *
 * 소비자 도메인 서비스에 의존하지 않는다 — 차량·예약 이력은 조회만 하고(공용 DB 직접 읽기,
 * ADR-010 잔여 결합), 쓰기는 biz가 소유한 LeaseContract에만 한다.
 */
@Module({
  controllers: [FleetController, LeasesController],
  providers: [FleetService, LeasesService],
})
export class FleetModule {}
