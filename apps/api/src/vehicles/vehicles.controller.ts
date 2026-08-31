import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { plan: true, zone: true },
    });
    if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');
    return vehicle;
  }

  /**
   * 특정 날짜(KST 기준)의 예약된 시간 구간 목록.
   * 프론트가 30분 슬롯 그리드에서 비활성 구간을 그리는 데 사용한다.
   */
  @Public()
  @Get(':id/availability')
  async availability(@Param('id') id: string, @Query('date') date?: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date=YYYY-MM-DD 형식이 필요합니다');
    }
    const dayStart = new Date(`${date}T00:00:00+09:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

    const busy = await this.prisma.reservation.findMany({
      where: {
        vehicleId: id,
        status: { in: ['CONFIRMED', 'IN_USE'] },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });
    return { date, busy };
  }
}
