import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { runSeed, SEED_VERSION } from './seed/run-seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  app.enableShutdownHooks();

  // Render 무료 티어에는 셸이 없어 배포 환경에서 부팅 시 시드를 판단한다.
  // 시드는 버전 마커(SeedMeta)로 관리: 코드의 SEED_VERSION이 DB 기록보다 높으면
  // 그 배포에서 딱 1회 재시드된다 — 시드 변경에 수동 개입이 필요 없다.
  // AUTO_SEED=force는 비상용(무조건 재시드, 부팅마다 초기화되므로 평소엔 'true').
  if (process.env.AUTO_SEED === 'true' || process.env.AUTO_SEED === 'force') {
    const prisma = app.get(PrismaService);
    const meta = await prisma.seedMeta.findUnique({ where: { id: 1 } });
    const currentVersion = meta?.version ?? 0;
    if (process.env.AUTO_SEED === 'force' || currentVersion < SEED_VERSION) {
      console.log(
        `[api] AUTO_SEED: 시드 v${currentVersion} → v${SEED_VERSION} 재시드 실행` +
          (process.env.AUTO_SEED === 'force' ? ' (force)' : ''),
      );
      await runSeed(prisma);
    }
  }

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`);
}

void bootstrap();
