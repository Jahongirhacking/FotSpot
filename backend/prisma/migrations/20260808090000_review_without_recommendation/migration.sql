-- An academy does not need a scout's permission to look at a player. A manager
-- who spots someone in search can send them straight to a coach, so a review is
-- keyed on the player and the recommendation becomes optional context.

ALTER TABLE "RecommendationReview" ADD COLUMN "playerId" TEXT;

-- Backfill from the recommendation every existing review came from.
UPDATE "RecommendationReview" AS r
SET "playerId" = rec."playerId"
FROM "Recommendation" AS rec
WHERE rec.id = r."recommendationId";

-- Any row we could not resolve has no player to review; there is nothing to keep.
DELETE FROM "RecommendationReview" WHERE "playerId" IS NULL;

ALTER TABLE "RecommendationReview" ALTER COLUMN "playerId" SET NOT NULL;
ALTER TABLE "RecommendationReview" ALTER COLUMN "recommendationId" DROP NOT NULL;

ALTER TABLE "RecommendationReview" DROP CONSTRAINT "RecommendationReview_recommendationId_fkey";
ALTER TABLE "RecommendationReview" ADD CONSTRAINT "RecommendationReview_recommendationId_fkey"
    FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationReview" ADD CONSTRAINT "RecommendationReview_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "RecommendationReview_recommendationId_academyId_key";
CREATE UNIQUE INDEX "RecommendationReview_playerId_academyId_key"
    ON "RecommendationReview"("playerId", "academyId");
