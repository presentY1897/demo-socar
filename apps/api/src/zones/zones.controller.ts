import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { parseRange, ZonesService } from './zones.service';

@Controller('zones')
export class ZonesController {
  constructor(
    private readonly zones: ZonesService,
    private readonly prisma: PrismaService,
  ) {}

  /** 존 목록. startAt/endAt 지정 시 해당 구간의 가용 차량 수 (편도 위치 체인 반영) */
  @Public()
  @Get()
  list(@Query('startAt') startAt?: string, @Query('endAt') endAt?: string) {
    return this.zones.list(parseRange(startAt, endAt));
  }

  /** 편도 반납 가능 존 목록 (출발 존 기준 같은 region) */
  @Public()
  @Get(':id/return-zones')
  async returnZones(@Param('id') id: string) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('존을 찾을 수 없습니다');
    return this.zones.returnZones(zone.region, id);
  }

  /** 존 상세. startAt/endAt 지정 시 가용 차량 + 예상 대여요금 */
  @Public()
  @Get(':id')
  detail(
    @Param('id') id: string,
    @Query('startAt') startAt?: string,
    @Query('endAt') endAt?: string,
  ) {
    return this.zones.detail(id, parseRange(startAt, endAt));
  }
}
