import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnswerInquiryDto, OpsInquiryQueryDto, OpsInquiryRes } from '@socar/shared';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

/** 문의함 목록 상한 — 화면은 상태 필터로 좁혀 본다 */
const LIST_LIMIT = 100;

const INQUIRY_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  vehicle: { select: { id: true, modelName: true, plateNo: true } },
  answeredBy: { select: { id: true, name: true } },
} satisfies Prisma.InquiryInclude;

type InquiryRow = Prisma.InquiryGetPayload<{ include: typeof INQUIRY_INCLUDE }>;

/**
 * 백오피스 문의함 (M3-3, 화면은 M3-5) — M1-7이 접수한 문의의 반대편.
 *
 * 답변은 한 번만 받는다: 이미 답변한 문의를 덮어쓰면 이용자가 본 문구와 백오피스가 보는
 * 문구가 갈린다. 수정이 필요하면 그건 새 문의(또는 별도 기능)로 다뤄야 할 일이다.
 */
@Injectable()
export class OpsInquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 답변 대기가 먼저, 그 안에서는 오래 기다린 것부터 */
  async list(query: OpsInquiryQueryDto): Promise<OpsInquiryRes[]> {
    const inquiries = await this.prisma.inquiry.findMany({
      where: { status: query.status },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: LIST_LIMIT,
      include: INQUIRY_INCLUDE,
    });
    return inquiries.map(toRes);
  }

  async answer(user: JwtUser, id: string, dto: AnswerInquiryDto): Promise<OpsInquiryRes> {
    const inquiry = await this.prisma.inquiry.findUnique({ where: { id } });
    if (!inquiry) throw new NotFoundException('문의를 찾을 수 없습니다');
    if (inquiry.status === 'ANSWERED') throw new ConflictException('이미 답변한 문의입니다');

    const answered = await this.prisma.inquiry.update({
      where: { id },
      data: {
        status: 'ANSWERED',
        answer: dto.answer,
        answeredAt: new Date(),
        answeredById: user.id,
      },
      include: INQUIRY_INCLUDE,
    });
    return toRes(answered);
  }
}

function toRes(inquiry: InquiryRow): OpsInquiryRes {
  return {
    id: inquiry.id,
    userId: inquiry.userId,
    vehicleId: inquiry.vehicleId,
    rentalId: inquiry.rentalId,
    category: inquiry.category,
    body: inquiry.body,
    status: inquiry.status,
    answer: inquiry.answer,
    answeredAt: inquiry.answeredAt?.toISOString() ?? null,
    createdAt: inquiry.createdAt.toISOString(),
    user: inquiry.user,
    vehicle: inquiry.vehicle,
    answeredBy: inquiry.answeredBy,
  };
}
