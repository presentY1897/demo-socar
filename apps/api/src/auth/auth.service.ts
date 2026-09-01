import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthUser, LoginResponse } from '@socar/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      corporationId: user.corporationId,
      corpGrade: user.corpGrade,
    };
    const accessToken = await this.jwt.signAsync({ sub: user.id, ...authUser });
    return { accessToken, user: authUser };
  }

  /**
   * 현재 세션의 사용자. 토큰 값이 아니라 DB에서 다시 읽는다 —
   * MANAGER가 등급을 바꾸면 재로그인 없이 다음 조회부터 반영돼야 한다.
   */
  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('세션이 만료되었습니다. 다시 로그인해 주세요');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      corporationId: user.corporationId,
      corpGrade: user.corpGrade,
    };
  }
}
