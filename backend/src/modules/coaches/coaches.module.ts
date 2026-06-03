// src/modules/coaches/coaches.module.ts
import { Module } from "@nestjs/common";
import { CoachesController } from "./coaches.controller";
import { CoachesService } from "./coaches.service";

@Module({
  controllers: [CoachesController],
  providers: [CoachesService],
  exports: [CoachesService],
})
export class CoachesModule {}
