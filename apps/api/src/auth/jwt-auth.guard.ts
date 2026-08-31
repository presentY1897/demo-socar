import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserRole } from '@socar/shared';
import { IS_PUBLIC_KEY } from './decorators';

export interface JwtUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  corporationId: string | null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('로그인이 필요합니다');

    try {
      const payload = await this.jwt.verifyAsync<JwtUser & { sub: string }>(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        corporationId: payload.corporationId,
      };
      return true;
    } catch {
      throw new UnauthorizedException('세션이 만료되었습니다. 다시 로그인해 주세요');
    }
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    // SSE는 커스텀 헤더를 못 붙이므로 쿼리 파라미터 허용
    const q = (req.query as Record<string, unknown>).token;
    return typeof q === 'string' ? q : null;
  }
}
