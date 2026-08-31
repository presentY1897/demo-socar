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

  // Render 무료 티어에는 셸이 없어 배포 환경에서 부팅 시 1회 시드
  if (process.env.AUTO_SEED === 'true') {
    const prisma = app.get(PrismaService);
    const users = await prisma.user.count();
    if (users === 0) {
      console.log('[api] AUTO_SEED: 빈 DB 감지 — 데모 데이터 시드 실행');
      await runSeed(prisma);
    }
  }

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`);
}

void bootstrap();
