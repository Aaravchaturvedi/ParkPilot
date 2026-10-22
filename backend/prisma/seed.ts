import { autoSeed } from '../src/services/seed';
import prisma from '../src/lib/prisma';

autoSeed()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
