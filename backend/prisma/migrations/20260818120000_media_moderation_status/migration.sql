-- Every clip is private until an admin has watched it.
--
-- Uploads are minutes of video of children and nothing on the platform knows
-- what is in one until a person looks. So the column defaults to UNVERIFIED and
-- only an admin's explicit act moves it — see the enum's note in schema.prisma.

-- CreateEnum
CREATE TYPE "MediaModerationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'BLOCKED');

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "moderationStatus" "MediaModerationStatus" NOT NULL DEFAULT 'UNVERIFIED';

-- CreateIndex
CREATE INDEX "Media_moderationStatus_status_createdAt_idx" ON "Media"("moderationStatus", "status", "createdAt" DESC);

-- ---------------------------------------------------------------------------
-- The clips that already exist.
--
-- ACTIVE means the worker found the object in the bucket and the clip has been
-- on a public profile and in the feed ever since. Those were accepted under the
-- rule that applied when they were uploaded and somebody is watching them right
-- now; defaulting them to UNVERIFIED would empty every profile and every feed at
-- deploy time and open the queue with the entire back catalogue rather than the
-- new uploads it exists to review. They stay visible.
--
-- Same reasoning, and the same shape, as 20260811090100_media_processing_columns:
-- a new gate applies to what comes after it, not retroactively to what passed
-- the old one.
UPDATE "Media" SET "moderationStatus" = 'VERIFIED' WHERE "status" = 'ACTIVE';

-- FLAGGED and REMOVED are already invisible to everyone — a moderator took the
-- first down and the owner deleted the second, and REMOVED clips have had their
-- objects deleted from the bucket. BLOCKED says the same thing on the axis that
-- now governs visibility, so neither can reappear if some future query checks
-- only one of the two columns.
UPDATE "Media" SET "moderationStatus" = 'BLOCKED' WHERE "status" IN ('FLAGGED', 'REMOVED');

-- PROCESSING and FAILED keep the UNVERIFIED default: a clip whose bytes have not
-- been found yet was never public, so there is nothing to preserve.
