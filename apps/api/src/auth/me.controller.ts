import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './decorators';
import type { JwtUser } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('coupons')
  coupons(@CurrentUser() user: JwtUser) {
    return this.prisma.coupon.findMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' },
    });
  }

  @Get('credit')
  async credit(@CurrentUser() user: JwtUser) {
    const agg = await this.prisma.creditLedger.aggregate({
      where: { userId: user.id },
      _sum: { deltaKrw: true },
    });
    return { balanceKrw: agg._sum.deltaKrw ?? 0 };
  }
}
