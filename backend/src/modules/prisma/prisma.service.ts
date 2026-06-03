import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// PrismaService extends PrismaClient and integrates with NestJS lifecycle
// This allows NestJS to manage the DB connection properly
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: "event", level: "query" }, // Log all SQL queries in dev
        { emit: "stdout", level: "error" },
        { emit: "stdout", level: "warn" },
      ],
    });
  }

  // Called when the NestJS module initializes
  async onModuleInit() {
    await this.$connect();
    this.logger.log("✅ Database connected");
  }

  // Called when the NestJS app shuts down — prevents connection leaks
  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log("🔌 Database disconnected");
  }

  // Useful for integration tests — cleans DB in the correct order (respecting FKs)
  async cleanDatabase() {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("cleanDatabase() can only be called in test environment");
    }
    const tablenames = await this.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    for (const { tablename } of tablenames) {
      if (tablename !== "_prisma_migrations") {
        await this.$executeRawUnsafe(
          `TRUNCATE TABLE "public"."${tablename}" CASCADE;`,
        );
      }
    }
  }
}
