import { PrismaClient } from '@prisma/client';
import { runSeed } from '../src/seed/run-seed';

process.env.DATABASE_URL ??= 'postgresql://socar:socar@localhost:5432/socar';
const prisma = new PrismaClient();

runSeed(prisma)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
