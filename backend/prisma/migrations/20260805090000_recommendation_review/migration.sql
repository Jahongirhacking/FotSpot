-- A coach's verdict on a player an academy is considering. Managers do not judge
-- football; a recommendation goes to an endorsed coach before anyone is invited.
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TYPE "NotificationEvent" ADD VALUE 'REVIEW_ASSIGNED';
ALTER TYPE "NotificationEvent" ADD VALUE 'ACADEMY_INVITATION';

CREATE TABLE "RecommendationReview" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "assessmentId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "RecommendationReview_pkey" PRIMARY KEY ("id")
);

-- One live review per recommendation per academy: two coaches deciding the same
-- player for the same academy is a contradiction, not a second opinion.
CREATE UNIQUE INDEX "RecommendationReview_recommendationId_academyId_key"
    ON "RecommendationReview"("recommendationId", "academyId");
CREATE INDEX "RecommendationReview_coachUserId_status_idx"
    ON "RecommendationReview"("coachUserId", "status");

ALTER TABLE "RecommendationReview" ADD CONSTRAINT "RecommendationReview_recommendationId_fkey"
    FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationReview" ADD CONSTRAINT "RecommendationReview_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "AcademyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationReview" ADD CONSTRAINT "RecommendationReview_coachUserId_fkey"
    FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
