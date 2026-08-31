import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('zones')
export class ZonesController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async list() {
    // 기업 전용존은 일반 이용자에게 비노출
    const zones = await this.prisma.zone.findMany({
      where: { corporationId: null },
      include: {
        _count: {
          select: { vehicles: { where: { status: 'AVAILABLE', corporationId: null } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return zones.map(({ _count, ...z }) => ({ ...z, vehicleCount: _count.vehicles }));
  }

  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: {
        vehicles: {
          where: { status: 'AVAILABLE', corporationId: null },
          include: { plan: true },
          orderBy: { modelName: 'asc' },
        },
      },
    });
    if (!zone || zone.corporationId !== null) throw new NotFoundException('존을 찾을 수 없습니다');
    return zone;
  }
}
