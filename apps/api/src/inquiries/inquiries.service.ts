import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateInquiryDto } from '@socar/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../auth/jwt-auth.guard';

/**
 * 문의 접수 — 답변(운영 백오피스)은 M3-5에서 붙는다.
 *
 * 차량/이용 연결은 선택이지만, 붙일 때는 실제로 존재하고 본인 것인지 확인한다.
 * 남의 이용 번호를 붙인 문의가 백오피스 문의함에 섞이면 그 자체가 정보 노출이다.
 */
@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: JwtUser, dto: CreateInquiryDto) {
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
      if (!vehicle) throw new NotFoundException('차량을 찾을 수 없습니다');
    }
    if (dto.rentalId) {
      const rental = await this.prisma.rental.findUnique({
        where: { id: dto.rentalId },
        include: { reservation: { select: { userId: true } } },
      });
      if (!rental) throw new NotFoundException('대여를 찾을 수 없습니다');
      if (rental.reservation.userId !== user.id) {
        throw new ForbiddenException('본인 이용에 대해서만 문의할 수 있습니다');
      }
    }

    return this.prisma.inquiry.create({
      data: {
        userId: user.id,
        vehicleId: dto.vehicleId ?? null,
        rentalId: dto.rentalId ?? null,
        category: dto.category,
        body: dto.body,
      },
    });
  }

  listMine(userId: string) {
    return this.prisma.inquiry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
