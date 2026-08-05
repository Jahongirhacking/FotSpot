-- A clip's rating is no longer necessarily the player's own: a coach watching it
-- can replace the number, and the column records which of them it came from.
CREATE TYPE "RatingSource" AS ENUM ('SELF', 'COACH');

ALTER TABLE "Media" RENAME COLUMN "selfRating" TO "rating";
ALTER TABLE "Media" ADD COLUMN "reportedBy" "RatingSource" NOT NULL DEFAULT 'SELF';

-- Every rating that existed before this migration was written by the player, so
-- the default is right for all of them.

-- What a rating was before someone changed it: a coach overwriting a child's own
-- number has to stay answerable later.
CREATE TABLE "RatingRevision" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "previousRating" INTEGER,
    "previousReportedBy" "RatingSource" NOT NULL,
    "rating" INTEGER NOT NULL,
    "reportedBy" "RatingSource" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RatingRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RatingRevision_mediaId_createdAt_idx" ON "RatingRevision"("mediaId", "createdAt");

ALTER TABLE "RatingRevision" ADD CONSTRAINT "RatingRevision_mediaId_fkey"
    FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
