-- The online coach review is gone from the product (TRIAL.md, 2026-09-07).
-- Rows that only that workflow produced are moved back to the state the new
-- flow reads, before the enum values they used are removed.

-- A target a coach was "reviewing" is simply pending again: the manager can
-- now invite the player to a private trial straight from the inbox.
UPDATE "RecommendationTarget" SET "status" = 'PENDING' WHERE "status" = 'REVIEWING';

-- Applicants parked in review-era states are applicants.
UPDATE "TrialApplication" SET "status" = 'APPLIED' WHERE "status" IN ('SCREENING', 'SHORTLISTED');

-- Notifications about reviews point at screens that no longer exist.
DELETE FROM "Notification" WHERE "event" IN ('REVIEW_ASSIGNED', 'REVIEW_DECIDED');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationEvent_new" AS ENUM ('ACADEMY_INVITATION', 'ACADEMY_JOIN_INVITATION', 'ACADEMY_JOIN_ANSWER', 'RECOMMENDATION_ACCEPTED', 'RECOMMENDATION_REJECTED', 'TRIAL_INVITATION', 'TRIAL_PUBLISHED', 'TRIAL_RESCHEDULED', 'TRIAL_RESULT', 'SQUAD_PLACEMENT', 'SQUAD_JOINED', 'SQUAD_LEFT', 'VERIFICATION_RESULT');
ALTER TABLE "Notification" ALTER COLUMN "event" TYPE "NotificationEvent_new" USING ("event"::text::"NotificationEvent_new");
ALTER TYPE "NotificationEvent" RENAME TO "NotificationEvent_old";
ALTER TYPE "NotificationEvent_new" RENAME TO "NotificationEvent";
DROP TYPE "public"."NotificationEvent_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "RecommendationStatus_new" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
ALTER TABLE "public"."Recommendation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."RecommendationTarget" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Recommendation" ALTER COLUMN "status" TYPE "RecommendationStatus_new" USING ("status"::text::"RecommendationStatus_new");
ALTER TABLE "RecommendationTarget" ALTER COLUMN "status" TYPE "RecommendationStatus_new" USING ("status"::text::"RecommendationStatus_new");
ALTER TYPE "RecommendationStatus" RENAME TO "RecommendationStatus_old";
ALTER TYPE "RecommendationStatus_new" RENAME TO "RecommendationStatus";
DROP TYPE "public"."RecommendationStatus_old";
ALTER TABLE "Recommendation" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "RecommendationTarget" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TrialApplicationStatus_new" AS ENUM ('APPLIED', 'INVITED', 'CONFIRMED', 'PASSED', 'FAILED', 'REJECTED', 'ACCEPTED');
ALTER TABLE "public"."TrialApplication" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TrialApplication" ALTER COLUMN "status" TYPE "TrialApplicationStatus_new" USING ("status"::text::"TrialApplicationStatus_new");
ALTER TYPE "TrialApplicationStatus" RENAME TO "TrialApplicationStatus_old";
ALTER TYPE "TrialApplicationStatus_new" RENAME TO "TrialApplicationStatus";
DROP TYPE "public"."TrialApplicationStatus_old";
ALTER TABLE "TrialApplication" ALTER COLUMN "status" SET DEFAULT 'APPLIED';
COMMIT;

-- DropForeignKey
ALTER TABLE "RecommendationReview" DROP CONSTRAINT "RecommendationReview_academyId_fkey";

-- DropForeignKey
ALTER TABLE "RecommendationReview" DROP CONSTRAINT "RecommendationReview_coachUserId_fkey";

-- DropForeignKey
ALTER TABLE "RecommendationReview" DROP CONSTRAINT "RecommendationReview_playerId_fkey";

-- DropForeignKey
ALTER TABLE "RecommendationReview" DROP CONSTRAINT "RecommendationReview_recommendationId_fkey";

-- DropForeignKey
ALTER TABLE "RecommendationReview" DROP CONSTRAINT "RecommendationReview_trialApplicationId_fkey";

-- DropForeignKey
ALTER TABLE "ReviewCoach" DROP CONSTRAINT "ReviewCoach_coachUserId_fkey";

-- DropForeignKey
ALTER TABLE "ReviewCoach" DROP CONSTRAINT "ReviewCoach_reviewId_fkey";

-- AlterTable
ALTER TABLE "TrialResult" ALTER COLUMN "coachProfileId" DROP NOT NULL;

-- DropTable
DROP TABLE "RecommendationReview";

-- DropTable
DROP TABLE "ReviewCoach";

-- DropEnum
DROP TYPE "ReviewSource";

-- DropEnum
DROP TYPE "ReviewStatus";

