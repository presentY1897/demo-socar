import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { corpGradeRank, type CorpGrade, type CorpMemberRes } from '@socar/shared';
import type { JwtUser } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 법인 멤버·등급 관리 (MANAGER 전용 — 권한 판정은 CorpPermissionGuard가 한다).
 *
 * biz 컨텍스트가 User 테이블을 직접 다루는 유일한 곳이다. 계정 자체는 소비자 서비스와
 * 공유하지만 `corpGrade`는 법인 소유 필드라 여기서만 쓴다 (ADR-010 잔여 결합 5번).
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: JwtUser): Promise<CorpMemberRes[]> {
    if (!actor.corporationId) throw new ForbiddenException('법인 소속이 아닙니다');
    const members = await this.prisma.user.findMany({
      where: { corporationId: actor.corporationId, corpGrade: { not: null } },
      select: { id: true, email: true, name: true, role: true, corpGrade: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    return members.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
      corpGrade: m.corpGrade as CorpGrade,
      createdAt: m.createdAt.toISOString(),
      isSelf: m.id === actor.id,
    }));
  }

  async updateGrade(actor: JwtUser, targetId: string, grade: CorpGrade): Promise<CorpMemberRes> {
    if (!actor.corporationId) throw new ForbiddenException('법인 소속이 아닙니다');

    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target || !target.corpGrade) throw new NotFoundException('법인 멤버를 찾을 수 없습니다');
    // 다른 법인 멤버는 존재 여부와 무관하게 건드릴 수 없다
    if (target.corporationId !== actor.corporationId) {
      throw new ForbiddenException('다른 법인의 멤버는 변경할 수 없습니다');
    }
    // 자기 강등 금지 — 법인에 MANAGER가 0명이 되어 등급 관리가 잠기는 상황을 막는다
    if (target.id === actor.id && corpGradeRank(grade) < corpGradeRank(target.corpGrade)) {
      throw new BadRequestException(
        '본인 등급은 낮출 수 없습니다. 다른 멤버를 관리자로 올린 뒤 변경해 주세요',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { corpGrade: grade },
      select: { id: true, email: true, name: true, role: true, corpGrade: true, createdAt: true },
    });
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      corpGrade: updated.corpGrade as CorpGrade,
      createdAt: updated.createdAt.toISOString(),
      isSelf: updated.id === actor.id,
    };
  }
}
