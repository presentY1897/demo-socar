import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { runSeed } from './seed/run-seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  app.enableShutdownHooks();

  // Render 무료 티어에는 셸이 없어 배포 환경에서 부팅 시 시드
  // - 'true': 빈 DB일 때만 1회
  // - 'force': 부팅마다 전체 재시드 (시드 데이터 교체용 — 쓰고 나면 'true'로 되돌릴 것)
  if (process.env.AUTO_SEED === 'true' || process.env.AUTO_SEED === 'force') {
    const prisma = app.get(PrismaService);
    const users = await prisma.user.count();
    if (users === 0 || process.env.AUTO_SEED === 'force') {
      console.log(`[api] AUTO_SEED=${process.env.AUTO_SEED}: 데모 데이터 시드 실행`);
      await runSeed(prisma);
      if (process.env.AUTO_SEED === 'force') {
        console.warn('[api] AUTO_SEED=force 상태 — 부팅마다 DB가 초기화됩니다. true로 되돌리세요');
      }
    }
  }

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`);
}

void bootstrap();
