-- CreateEnum
CREATE TYPE "TrialType" AS ENUM ('GENERAL', 'PRIVATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrialApplicationStatus" ADD VALUE 'SCREENING';
ALTER TYPE "TrialApplicationStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "RecommendationReview" ADD COLUMN     "trialApplicationId" TEXT;

-- AlterTable
ALTER TABLE "Trial" ADD COLUMN     "type" "TrialType" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "TrialApplication" ADD COLUMN     "inviteNote" TEXT;

-- CreateTable
CREATE TABLE "TrialCoach" (
    "trialId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialCoach_pkey" PRIMARY KEY ("trialId","coachUserId")
);

-- CreateIndex
CREATE INDEX "TrialCoach_coachUserId_idx" ON "TrialCoach"("coachUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationReview_trialApplicationId_key" ON "RecommendationReview"("trialApplicationId");

-- AddForeignKey
ALTER TABLE "RecommendationReview" ADD CONSTRAINT "RecommendationReview_trialApplicationId_fkey" FOREIGN KEY ("trialApplicationId") REFERENCES "TrialApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialCoach" ADD CONSTRAINT "TrialCoach_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "Trial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialCoach" ADD CONSTRAINT "TrialCoach_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

