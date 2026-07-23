import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEFAULT_ROLES = ['scout', 'player', 'coach', 'academy_manager', 'admin', 'super_admin'];

async function main() {
  for (const name of DEFAULT_ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const bootstrapEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@fotspot.uz';
  const bootstrapPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email: bootstrapEmail } });
  if (!existing) {
    const passwordHash = await argon2.hash(bootstrapPassword);
    const user = await prisma.user.create({
      data: { email: bootstrapEmail, passwordHash, firstName: 'Super', lastName: 'Admin' },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'super_admin' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    // eslint-disable-next-line no-console
    console.log(`Seeded super_admin: ${bootstrapEmail} / ${bootstrapPassword} (change this password)`);
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
