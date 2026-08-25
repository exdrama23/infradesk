import { PrismaClient, UserRole } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = await argon2.hash('senha123', {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 2,
  });

  await prisma.user.upsert({
    where: { email: 'alice@empresa.com' },
    update: {},
    create: {
      name: 'Alice Souza',
      email: 'alice@empresa.com',
      password,
      role: UserRole.USER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'dev@infradesk.com' },
    update: {},
    create: {
      name: 'Diego Dev',
      email: 'dev@infradesk.com',
      password,
      role: UserRole.DEV,
    },
  });

  await prisma.user.upsert({
    where: { email: 'dev2@infradesk.com' },
    update: {},
    create: {
      name: 'Ana Analista',
      email: 'dev2@infradesk.com',
      password,
      role: UserRole.DEV,
    },
  });

  await prisma.user.upsert({
    where: { email: 'lider@infradesk.com' },
    update: {},
    create: {
      name: 'Marcos Lima',
      email: 'lider@infradesk.com',
      password,
      role: UserRole.LIDER,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });