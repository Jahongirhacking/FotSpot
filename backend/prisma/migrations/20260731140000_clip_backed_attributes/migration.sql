-- Realign MediaCategory with the player-card attributes (§21.1).
--
-- SPRINT and SHOOTING described the same things the card calls PACE and
-- FINISHING; with two vocabularies nothing could connect a clip to the bar it
-- was uploaded to prove. Existing rows are mapped, not dropped.
--
-- Postgres cannot remove a value from an enum in place, so the type is rebuilt
-- and the column cast across with an explicit mapping.

ALTER TYPE "MediaCategory" RENAME TO "MediaCategory_old";

CREATE TYPE "MediaCategory" AS ENUM (
  'PACE',
  'DRIBBLING',
  'PASSING',
  'FINISHING',
  'PHYSICAL',
  'TECHNIQUE',
  'MATCH_HIGHLIGHTS'
);

ALTER TABLE "Media"
  ALTER COLUMN "category" TYPE "MediaCategory"
  USING (
    CASE "category"::text
      WHEN 'SPRINT'   THEN 'PACE'
      WHEN 'SHOOTING' THEN 'FINISHING'
      ELSE "category"::text
    END
  )::"MediaCategory";

DROP TYPE "MediaCategory_old";

-- A clip now carries the claim it evidences.
ALTER TABLE "Media"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "selfRating" INTEGER;

-- The card reads "newest clip per category" on every render.
CREATE INDEX "Media_playerId_category_createdAt_idx"
  ON "Media" ("playerId", "category", "createdAt" DESC);
