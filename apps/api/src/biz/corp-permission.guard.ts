import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasCorpPermission, type CorpGrade, type CorpPermission } from '@socar/shared';
import type { JwtUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

export const CORP_PERMISSION_KEY = 'corpPermission';

/**
 * 이 핸들러(또는 컨트롤러)를 호출하려면 필요한 법인 권한.
 * 여러 개를 주면 전부 필요하다(AND).
 *
 *   @RequireCorpPermission('approve')
 */
export const RequireCorpPermission = (...permissions: CorpPermission[]) =>
  SetMetadata(CORP_PERMISSION_KEY, permissions);

/** 요청 객체에 실려 내려가는, DB에서 다시 읽은 최신 등급 */
export interface CorpActor extends JwtUser {
  corporationId: string;
  corpGrade: CorpGrade;
}

/**
 * 법인 등급 권한 가드 (biz 컨텍스트 전용).
 *
 * 판정은 shared `CORP_PERMISSIONS`(= `hasCorpPermission`)에만 의존한다 — 등급→권한 표를
 * 가드가 다시 적지 않으므로 웹 화면 분기와 영원히 같은 답을 낸다.
 *
 * 등급은 JWT가 아니라 DB에서 다시 읽는다: MANAGER가 등급을 낮춰도 상대의 토큰(7일)이
 * 살아 있는 동안 옛 권한이 유지되면 안 되기 때문이다.
 */
@Injectable()
export class CorpPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<CorpPermission[] | undefined>(
      CORP_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('법인 서비스 이용 권한이 없습니다');

    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { corporationId: true, corpGrade: true },
    });
    // 법인 미소속(개인 이용자·운영 어드민)은 biz 컨텍스트 밖이다
    if (!current?.corporationId || !current.corpGrade) {
      throw new ForbiddenException('법인 계정만 이용할 수 있습니다');
    }
    if (!required.every((p) => hasCorpPermission(current.corpGrade, p))) {
      throw new ForbiddenException('현재 등급으로는 할 수 없는 작업입니다');
    }

    // 이후 핸들러/서비스는 토큰이 아닌 최신 등급을 본다
    user.corporationId = current.corporationId;
    user.corpGrade = current.corpGrade;
    return true;
  }
}
