-- One clip, one viewer, one day — enforced by the database rather than by a
-- cache that has to be reachable first. See the note on `MediaView` in the
-- schema for why this moved.
--
-- Written by hand rather than generated, because the columns are NOT NULL on a
-- table that already has rows: they are added nullable, backfilled, and only
-- then tightened. Nothing is deleted and no existing count changes.

-- 1. Add both columns nullable so the ALTER cannot fail on existing rows.
ALTER TABLE "MediaView" ADD COLUMN "viewerKey" TEXT;
ALTER TABLE "MediaView" ADD COLUMN "viewDate" DATE;

-- 2. Backfill.
--
-- Every pre-existing row gets a viewerKey derived from its own primary key, so
-- the unique index below cannot fail however many duplicates history contains —
-- and it deliberately does not dedupe them. Those rows are a record of views
-- that were counted under the old rule; rewriting them would be changing
-- published numbers to make a constraint fit.
--
-- The consequence is intentional: a legacy row never collides with a new one, so
-- somebody who watched a clip yesterday can still be counted today.
UPDATE "MediaView"
SET "viewerKey" = 'legacy:' || "id",
    "viewDate"  = ("createdAt" AT TIME ZONE 'UTC')::date
WHERE "viewerKey" IS NULL;

-- 3. Now that every row has a value, require one.
ALTER TABLE "MediaView" ALTER COLUMN "viewerKey" SET NOT NULL;
ALTER TABLE "MediaView" ALTER COLUMN "viewDate" SET NOT NULL;

-- 4. The rule itself.
CREATE UNIQUE INDEX "MediaView_mediaId_viewerKey_viewDate_key"
  ON "MediaView"("mediaId", "viewerKey", "viewDate");
