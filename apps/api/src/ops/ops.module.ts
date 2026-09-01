import { Module } from '@nestjs/common';
import { OpsLeasesController } from './leases/leases.controller';
import { OpsLeasesService } from './leases/leases.service';

/**
 * 운영 어드민(MOCAR 내부) 컨텍스트 — URL은 `/ops/*`.
 *
 * `/biz`(법인 고객)와 반대편이다: 같은 리스 계약을 보되 법인은 요청만, 운영은 결정만 한다.
 * M3 백오피스가 붙으면 정산·차량 운영 도구도 이 모듈 아래로 들어온다.
 */
@Module({
  controllers: [OpsLeasesController],
  providers: [OpsLeasesService],
})
export class OpsModule {}
