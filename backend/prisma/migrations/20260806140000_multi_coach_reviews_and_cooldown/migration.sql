-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "rejectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TrialApplication" ADD COLUMN     "recommendationId" TEXT;

-- CreateTable
CREATE TABLE "ReviewCoach" (
    "reviewId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewCoach_pkey" PRIMARY KEY ("reviewId","coachUserId")
);

-- CreateIndex
CREATE INDEX "ReviewCoach_coachUserId_idx" ON "ReviewCoach"("coachUserId");

-- AddForeignKey
ALTER TABLE "ReviewCoach" ADD CONSTRAINT "ReviewCoach_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "RecommendationReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCoach" ADD CONSTRAINT "ReviewCoach_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialApplication" ADD CONSTRAINT "TrialApplication_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing reviews were handed to exactly one coach. Backfill the join table so
-- "who may answer this" is complete for rows created before it existed.
INSERT INTO "ReviewCoach" ("reviewId", "coachUserId", "coachProfileId", "assignedAt")
SELECT "id", "coachUserId", "coachProfileId", "assignedAt" FROM "RecommendationReview"
ON CONFLICT DO NOTHING;
