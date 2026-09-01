import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../auth/decorators';
import { OpsAlertsService } from './alerts.service';

/**
 * 운영 홈(M3-4)이 쓰는 두 응답.
 * 한 컨트롤러에 둔 이유는 둘 다 "지금 이 순간의 운영 상황"을 서로 다른 해상도로 보여주는
 * 같은 화면의 재료이기 때문이다 — 스탯은 요약, 경고는 그중 손대야 할 것.
 */
@Roles('OPS_ADMIN')
@Controller('ops')
export class OpsAlertsController {
  constructor(private readonly alerts: OpsAlertsService) {}

  /** 운영 홈 상단 스탯 */
  @Get('overview')
  overview() {
    return this.alerts.overview();
  }

  /** 경고 피드 — 연료 부족 · 보험 만기 · 계약 만료 · 지연 반납 진행 중 */
  @Get('alerts')
  list() {
    return this.alerts.alerts();
  }
}
