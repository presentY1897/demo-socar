import { Module } from '@nestjs/common';
import { OpsLeasesController } from './leases/leases.controller';
import { OpsLeasesService } from './leases/leases.service';
import { OpsTasksModule } from './tasks/ops-tasks.module';

/**
 * 운영 어드민(MOCAR 내부) 컨텍스트 — URL은 `/ops/*`.
 *
 * `/biz`(법인 고객)와 반대편이다: 같은 리스 계약을 보되 법인은 요청만, 운영은 결정만 한다.
 * 도메인은 하위 폴더 모듈로 나눈다 (M3-3에서 계속 확장된다) — 이 파일은 목록만 유지한다.
 */
@Module({
  imports: [OpsTasksModule],
  controllers: [OpsLeasesController],
  providers: [OpsLeasesService],
})
export class OpsModule {}
