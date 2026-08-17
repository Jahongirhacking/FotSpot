import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

const DEFAULT_ROLES = ['scout', 'player', 'coach', 'academy_manager', 'admin', 'super_admin'];

const PLAN_TIERS = ['FREE', 'PRO', 'PREMIUM'] as const;

/**
 * DATABASE_URL'dan xavfsiz ma'lumotlarni olish.
 * Password hech qachon log qilinmaydi.
 */
function getDatabaseInfo(url?: string) {
  if (!url) {
    return {
      host: 'UNKNOWN',
      port: 'UNKNOWN',
      database: 'UNKNOWN',
      user: 'UNKNOWN',
    };
  }

  try {
    const parsed = new URL(url);

    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\/+/, ''),
      user: decodeURIComponent(parsed.username),
    };
  } catch {
    return {
      host: 'INVALID DATABASE_URL',
      port: 'UNKNOWN',
      database: 'UNKNOWN',
      user: 'UNKNOWN',
    };
  }
}

/**
 * Haqiqiy database connectionni tekshiradi.
 */
async function debugDatabaseConnection() {
  console.log('');
  console.log('========================================');
  console.log('🗄️ DATABASE CONFIGURATION');
  console.log('========================================');

  const dbInfo = getDatabaseInfo(process.env.DATABASE_URL);

  console.log(`→ Host:     ${dbInfo.host}`);
  console.log(`→ Port:     ${dbInfo.port}`);
  console.log(`→ Database: ${dbInfo.database}`);
  console.log(`→ User:     ${dbInfo.user}`);
  console.log('→ Password: ********');
  console.log('');

  console.log('🔌 Testing actual PostgreSQL connection...');

  try {
    await prisma.$connect();

    console.log('✅ Prisma connected successfully');

    const result = await prisma.$queryRaw<
      {
        database: string;
        serverAddress: string | null;
        serverPort: number;
        currentUser: string;
      }[]
    >`
      SELECT
        current_database() AS database,
        inet_server_addr()::text AS "serverAddress",
        inet_server_port() AS "serverPort",
        current_user AS "currentUser"
    `;

    const connection = result[0];

    console.log('');
    console.log('📡 ACTUAL POSTGRESQL CONNECTION');
    console.log('----------------------------------------');
    console.log(`→ Database:       ${connection?.database}`);
    console.log(`→ Server address: ${connection?.serverAddress}`);
    console.log(`→ Server port:    ${connection?.serverPort}`);
    console.log(`→ Current user:   ${connection?.currentUser}`);
    console.log('========================================');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ DATABASE CONNECTION FAILED');
    console.error('========================================');
    console.error(error);
    console.error('========================================');
    console.error('');

    throw error;
  }
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('🌱 FOTSPOT DATABASE SEED');
  console.log('========================================');
  console.log('');

  // ==================================================
  // DATABASE CONNECTION
  // ==================================================

  await debugDatabaseConnection();

  // ==================================================
  // 1. ROLES
  // ==================================================

  console.log('');
  console.log('========================================');
  console.log('1️⃣ SEEDING ROLES');
  console.log('========================================');

  for (const name of DEFAULT_ROLES) {
    console.log(`→ Processing role: ${name}`);

    const role = await prisma.role.upsert({
      where: {
        name,
      },
      update: {},
      create: {
        name,
      },
    });

    console.log(`  ✅ Role ready: ${role.name} (${role.id})`);
  }

  console.log('');
  console.log('✅ All roles seeded successfully');

  // ==================================================
  // 2. TARIFF PLANS
  // ==================================================

  console.log('');
  console.log('========================================');
  console.log('2️⃣ SEEDING TARIFF PLANS');
  console.log('========================================');

  for (const tier of PLAN_TIERS) {
    console.log(`→ Processing tariff plan: ${tier}`);

    const plan = await prisma.tariffPlan.upsert({
      where: {
        tier,
      },
      update: {},
      create: {
        tier,
      },
    });

    console.log(`  ✅ Tariff plan ready: ${plan.tier}`);
  }

  console.log('');
  console.log('✅ All tariff plans seeded successfully');

  // ==================================================
  // 3. SUPER ADMIN
  // ==================================================

  const bootstrapEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@fotspot.uz';

  const bootstrapPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe123!';

  console.log('');
  console.log('========================================');
  console.log('3️⃣ SUPER ADMIN');
  console.log('========================================');

  console.log(`→ Email: ${bootstrapEmail}`);

  // ==================================================
  // CHECK EXISTING USER
  // ==================================================

  console.log('');
  console.log('🔎 Checking if super admin user already exists...');

  const existing = await prisma.user.findUnique({
    where: {
      email: bootstrapEmail,
    },
  });

  let superAdminUserId: string;

  if (existing) {
    superAdminUserId = existing.id;

    console.log('');
    console.log('ℹ️ SUPER ADMIN USER ALREADY EXISTS');
    console.log('----------------------------------------');
    console.log(`→ User ID: ${existing.id}`);
    console.log(`→ Email:   ${existing.email}`);
    console.log(`→ Active:  ${existing.isActive}`);
    console.log(`→ Plan:    ${existing.planTier}`);
    console.log('');
    console.log('⚠️ User data was NOT changed.');
  } else {
    // ==================================================
    // CREATE SUPER ADMIN USER
    // ==================================================

    console.log('');
    console.log('👤 Super admin user does not exist.');
    console.log('→ Creating user...');

    const passwordHash = await argon2.hash(bootstrapPassword);

    console.log('→ Password hashed with Argon2');

    const user = await prisma.user.create({
      data: {
        email: bootstrapEmail,
        passwordHash,
        firstName: 'Super',
        lastName: 'Admin',
      },
    });

    superAdminUserId = user.id;

    console.log('');
    console.log('✅ USER CREATED');
    console.log('----------------------------------------');
    console.log(`→ User ID: ${user.id}`);
    console.log(`→ Email:   ${user.email}`);
    console.log(`→ Name:    ${user.firstName} ${user.lastName}`);
    console.log(`→ Active:  ${user.isActive}`);
    console.log(`→ Plan:    ${user.planTier}`);
  }

  // ==================================================
  // FIND SUPER ADMIN ROLE
  // ==================================================

  console.log('');
  console.log('🔎 Finding super_admin role...');

  const superAdminRole = await prisma.role.findUnique({
    where: {
      name: 'super_admin',
    },
  });

  if (!superAdminRole) {
    throw new Error(
      'super_admin role was not found. Roles should have been seeded before this step.',
    );
  }

  console.log('✅ Role found');
  console.log(`→ Role ID: ${superAdminRole.id}`);
  console.log(`→ Role:    ${superAdminRole.name}`);

  // ==================================================
  // CHECK USER ROLE
  // ==================================================

  console.log('');
  console.log('🔎 Checking super_admin role assignment...');

  const existingUserRole = await prisma.userRole.findFirst({
    where: {
      userId: superAdminUserId,
      roleId: superAdminRole.id,
    },
  });

  if (existingUserRole) {
    console.log('ℹ️ User already has super_admin role.');
    console.log(`→ User ID: ${superAdminUserId}`);
    console.log(`→ Role ID: ${superAdminRole.id}`);
  } else {
    // ==================================================
    // ASSIGN ROLE
    // ==================================================

    console.log('→ User does not have super_admin role.');
    console.log('→ Assigning role...');

    await prisma.userRole.create({
      data: {
        userId: superAdminUserId,
        roleId: superAdminRole.id,
      },
    });

    console.log('✅ super_admin role assigned');
  }

  // ==================================================
  // 4. VERIFY SUPER ADMIN USER
  // ==================================================

  console.log('');
  console.log('========================================');
  console.log('4️⃣ VERIFYING SUPER ADMIN');
  console.log('========================================');

  const verifiedUser = await prisma.user.findUnique({
    where: {
      email: bootstrapEmail,
    },
  });

  if (!verifiedUser) {
    throw new Error(`Super admin verification failed. User ${bootstrapEmail} was not found.`);
  }

  console.log(`→ User ID: ${verifiedUser.id}`);
  console.log(`→ Email:   ${verifiedUser.email}`);
  console.log(`→ Active:  ${verifiedUser.isActive}`);
  console.log(`→ Plan:    ${verifiedUser.planTier}`);

  // ==================================================
  // VERIFY SUPER ADMIN ROLE
  // ==================================================

  const verifiedRole = await prisma.role.findUnique({
    where: {
      name: 'super_admin',
    },
  });

  if (!verifiedRole) {
    throw new Error('super_admin role was not found.');
  }

  const verifiedUserRole = await prisma.userRole.findFirst({
    where: {
      userId: verifiedUser.id,
      roleId: verifiedRole.id,
    },
  });

  if (!verifiedUserRole) {
    throw new Error(`User ${bootstrapEmail} exists, but does not have super_admin role.`);
  }

  console.log(`→ Role:    ${verifiedRole.name}`);

  console.log('');
  console.log('✅ SUPER ADMIN VERIFIED');

  // ==================================================
  // FINAL SUCCESS
  // ==================================================

  console.log('');
  console.log('========================================');
  console.log('🎉 SEED COMPLETED SUCCESSFULLY');
  console.log('========================================');
  console.log('');
}

// ==================================================
// RUN
// ==================================================

main()
  .catch((error) => {
    console.error('');
    console.error('========================================');
    console.error('❌ SEED FAILED');
    console.error('========================================');
    console.error(error);
    console.error('========================================');
    console.error('');

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('🔌 Prisma disconnected');
  });
