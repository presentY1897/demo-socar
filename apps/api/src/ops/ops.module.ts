import { Module } from '@nestjs/common';
import { OpsAccountingModule } from './accounting/ops-accounting.module';
import { OpsAlertsModule } from './alerts/ops-alerts.module';
import { OpsFleetModule } from './fleet/ops-fleet.module';
import { OpsInquiriesModule } from './inquiries/ops-inquiries.module';
import { OpsLeasesController } from './leases/leases.controller';
import { OpsLeasesService } from './leases/leases.service';
import { OpsReportsModule } from './reports/ops-reports.module';
import { OpsTasksModule } from './tasks/ops-tasks.module';
import { OpsUsersModule } from './users/ops-users.module';
import { OpsZonesModule } from './zones/ops-zones.module';

/**
 * 운영 어드민(MOCAR 내부) 컨텍스트 — URL은 `/ops/*`.
 *
 * `/biz`(법인 고객)와 반대편이다: 같은 리스 계약을 보되 법인은 요청만, 운영은 결정만 한다.
 * 도메인은 하위 폴더 모듈로 나눈다 — 이 파일은 목록만 유지한다.
 * 전 엔드포인트가 `@Roles('OPS_ADMIN')`이라 컨트롤러마다 같은 가드가 붙는다.
 */
@Module({
  imports: [
    OpsTasksModule, // 작업/배차 (M2-4)
    OpsFleetModule, // 차량 + 등록 (M3-3)
    OpsZonesModule, // 존 계약 (M3-3)
    OpsUsersModule, // 유의 유저 (M3-3)
    OpsInquiriesModule, // 문의함 (M3-3)
    OpsAccountingModule, // 회계 (M3-3)
    OpsAlertsModule, // 운영 홈 스탯 + 경고 피드 (M3-3)
    OpsReportsModule, // 리포트 빌더 (M4-2)
  ],
  controllers: [OpsLeasesController],
  providers: [OpsLeasesService],
})
export class OpsModule {}
