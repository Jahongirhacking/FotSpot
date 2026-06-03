import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// @Global() makes PrismaService available app-wide without importing PrismaModule everywhere
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
