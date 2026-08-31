import { BadRequestException, Controller, Get, Query, Sse } from '@nestjs/common';
import { defer, interval, map, startWith, switchMap } from 'rxjs';
import { Roles } from '../auth/decorators';
import { MetricsService } from './metrics.service';

function parseDays(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new BadRequestException('days는 1~90 사이의 정수여야 합니다');
  }
  return days;
}

@Roles('OPS_ADMIN')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('summary')
  summary(@Query('days') days?: string) {
    return this.metrics.summary(parseDays(days, 30));
  }

  @Get('daily')
  daily(@Query('days') days?: string) {
    return this.metrics.daily(parseDays(days, 14));
  }

  /** 실시간 차량 현황 스트림 (5초 주기). EventSource는 ?token= 으로 인증 */
  @Sse('vehicles/live')
  live() {
    return interval(5000).pipe(
      startWith(0),
      switchMap(() => defer(() => this.metrics.liveVehicles())),
      map((vehicles) => ({ data: { ts: new Date().toISOString(), vehicles } })),
    );
  }
}
