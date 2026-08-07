-- Splits the real-life trial verdict out of the online coach review.
--
-- They had been one row: after a player confirmed, the same RecommendationReview
-- was reopened to PENDING and decided a second time, so the profile screening
-- and the verdict on the day overwrote each other. TRIAL.md Rule 19 forbids
-- merging them, and TrialResult is the separate half — PASS/FAIL, written by a
-- coach who was on the pitch, one per application.
--
-- `Recommendation.clearedAt` is the other half of Rule 13: a pass empties the
-- player's live recommendations without destroying the rows the scouts' success
-- rate is computed from.

-- CreateEnum
CREATE TYPE "TrialVerdict" AS ENUM ('PASS', 'FAIL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrialApplicationStatus" ADD VALUE 'PASSED';
ALTER TYPE "TrialApplicationStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "clearedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TrialResult" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "verdict" "TrialVerdict" NOT NULL,
    "note" TEXT,
    "assessmentId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialResult_applicationId_key" ON "TrialResult"("applicationId");

-- CreateIndex
CREATE INDEX "TrialResult_coachUserId_idx" ON "TrialResult"("coachUserId");

-- AddForeignKey
ALTER TABLE "TrialResult" ADD CONSTRAINT "TrialResult_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "TrialApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialResult" ADD CONSTRAINT "TrialResult_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
