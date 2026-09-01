import { Module } from '@nestjs/common';
import { DispatchModule } from './dispatch/dispatch.module';
import { FleetModule } from './fleet/fleet.module';
import { MembersModule } from './members/members.module';

/**
 * MOCAR 비즈니스 — 법인 플릿/리스 관리 바운디드 컨텍스트.
 *
 * 소비자 앱(zones/vehicles/reservations/rentals)과 분리된 서비스 경계다.
 * 모든 엔드포인트는 `/biz/*` 네임스페이스에 모이고, 소비자 도메인으로 나가는 호출은
 * `ports/`의 인터페이스 + `adapters/`의 구현으로만 지나간다 (ADR-010).
 * 이후 M5 작업(멤버·플릿·리스)도 전부 이 모듈 하위에 추가한다.
 */
@Module({
  imports: [DispatchModule, MembersModule, FleetModule],
})
export class BizModule {}
