-- Tariff plans, plus the 0-100 rating range as a database rule.

-- ---------- Tariff plans ----------

CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'PREMIUM');

CREATE TABLE "TariffPlan" (
    "tier" "PlanTier" NOT NULL,
    "clipLimit" INTEGER NOT NULL DEFAULT 10,
    "clipWindowDays" INTEGER NOT NULL DEFAULT 7,
    "pendingRecommendationLimit" INTEGER NOT NULL DEFAULT 10,
    "maxCoaches" INTEGER NOT NULL DEFAULT 5,
    "maxGroups" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffPlan_pkey" PRIMARY KEY ("tier")
);

-- A negative limit is not a stricter plan, it is a plan nobody can use: every
-- check reads `count >= limit`, so -1 locks the feature shut with a message that
-- says "0 left" and no way to explain why. Refused at the database so a typo in
-- the admin form cannot become a permanent state.
ALTER TABLE "TariffPlan" ADD CONSTRAINT "tariff_plan_limits_non_negative" CHECK (
    "clipLimit" >= 0
    AND "clipWindowDays" >= 1
    AND "pendingRecommendationLimit" >= 0
    AND "maxCoaches" >= 0
    AND "maxGroups" >= 0
);

-- The three tiers exist from the moment the table does. Every account points at
-- one through a foreign key, so a missing row is not "no plan configured yet" --
-- it is an account that cannot be written.
INSERT INTO "TariffPlan" ("tier") VALUES ('FREE'), ('PRO'), ('PREMIUM');

ALTER TABLE "User" ADD COLUMN "planTier" "PlanTier" NOT NULL DEFAULT 'FREE';

ALTER TABLE "User" ADD CONSTRAINT "User_planTier_fkey"
    FOREIGN KEY ("planTier") REFERENCES "TariffPlan"("tier")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Ratings are 0-100, everywhere ----------

-- Clamped before the constraints go on. The DTOs have always bounded these, so
-- this should touch nothing -- but a migration that aborts on one bad row leaves
-- the whole deployment stuck, and a rating outside the range is already wrong in
-- a way no reader can interpret. Clamping states what the value should have been.
UPDATE "Media"
   SET "rating" = LEAST(100, GREATEST(0, "rating"))
 WHERE "rating" IS NOT NULL AND ("rating" < 0 OR "rating" > 100);

UPDATE "RatingRevision"
   SET "rating" = LEAST(100, GREATEST(0, "rating")),
       "previousRating" = LEAST(100, GREATEST(0, "previousRating"))
 WHERE "rating" < 0 OR "rating" > 100
    OR ("previousRating" IS NOT NULL AND ("previousRating" < 0 OR "previousRating" > 100));

ALTER TABLE "Media" ADD CONSTRAINT "media_rating_range" CHECK (
    "rating" IS NULL OR ("rating" >= 0 AND "rating" <= 100)
);

ALTER TABLE "RatingRevision" ADD CONSTRAINT "rating_revision_rating_range" CHECK (
    "rating" >= 0 AND "rating" <= 100
);

ALTER TABLE "RatingRevision" ADD CONSTRAINT "rating_revision_previous_rating_range" CHECK (
    "previousRating" IS NULL OR ("previousRating" >= 0 AND "previousRating" <= 100)
);
